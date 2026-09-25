# Rollback del cutover (Task 17)

**Stato:** regole scritte, mai eseguite. Si applicano durante il Task 18 (runbook in
[`cutover.md`](./cutover.md)).

La domanda che decide tutto è una sola: **Convex ha già ricevuto scritture che non esistono su
Neon?** Finché la risposta è no, tornare al blu non perde nulla e il rollback è completo. Dopo,
tornare al blu significherebbe buttare dati reali — quindi non si torna indietro in automatico.

## Definizione misurabile di "prima write Convex"

Una scrittura sul deployment Convex di produzione **non prodotta dal pipeline di import** (le
righe dell'import portano `legacyId` e sono ricostruibili da Neon in qualunque momento). Include:
azioni utente dalla SPA o dalle API del Worker, webhook Creem (dopo il passo 8.2), job e cron
Convex che mutano dati di dominio. Il webhook Resend no: in read-only risponde `503` e Svix
ritenta dopo la finestra. Job e cron Convex girano **solo** in `active` (final review C2,
`sideEffectsAllowed` in `convex/lib/writeGuard.ts`): prima del passo 10 non possono produrre
write, quindi in pratica l'unica fonte possibile prima del passo 10 è un webhook Creem. Il test
`convex/siteModeSideEffects.test.ts` enumera ogni cron e ogni tipo di job.

Si **misura**, non si presume:

```bash
# credenziali di produzione nella shell del cutover, mai sulla riga di comando (cutover.md 0.25)
pnpm tsx scripts/migration/reconcile.ts --manifest .migration-cutover/delta/manifest.json \
  --out .migration-cutover/reconcile-check.json --first-write-check \
  --production --confirm-deployment prod:<nome> --preflight-report .migration-cutover/preflight.json
```

Sempre contro la **produzione** (Convex e Neon): `reconcile.ts` rifiuta `--first-write-check`
senza `--production`, e senza un target esplicito non parte affatto — una misura presa su staging
direbbe "nessuna write" e aprirebbe un rollback §A sbagliato.

- `exit 0`, nessuna riga `only_in_target`, nessun `webhookEvents` nuovo rispetto al registro del
  passo 6 → **nessuna write**: vale §A.
- altrimenti → **write avvenute**: vale §B.

Perché misurare anche con la guardia Convex (cutover B4, chiuso): la guardia copre le funzioni
pubbliche e (C2) cron e job, non i percorsi provider (webhook Creem), che scrivono per
costruzione. "Abbiamo impostato la read-only" riduce le write possibili a quelle; la misura dice se
sono avvenute.

In caso di dubbio (reconcile non eseguibile, report ambiguo) si assume §B.

## §A — Prima delle prime write Convex: rollback completo consentito

Condizioni: il passo 10 del runbook non è stato eseguito **e** la misura sopra dice "nessuna write".
Trigger tipici: preflight rosso nella finestra, delta+reconcile oltre 15 min, reconcile `exit 1`,
checklist manuale fallita, smoke read-only `exit 1`, finestra oltre 30 min.

Ordine (inverso rispetto al runbook, ognuno registrato con ora UTC):

1. **DNS**: il record di `ceremly.com` torna al target Vercel registrato
   (`deployments.legacyVercelDeployment`, build del branch `legacy-vercel`, commit
   `deployments.legacyBuiltFromCommit` = tag `legacy-vercel-final`). **Mai** un redeploy da `main`:
   dal commit `e6bfe5d` il suo frontend è solo-Convex e su Vercel non funziona (final review C1).
   La propagazione è bounded dal TTL approvato.
2. **Webhook Creem**: endpoint di nuovo su `https://ceremly.com/api/auth/creem/webhook` con il
   segreto legacy. Eventi arrivati a Convex nel frattempo (se il passo 8.2 era fatto) sono **write
   Convex** → non si è in §A: ricontrollare la misura.
3. **Callback Google**: nessun cambio di path (proxy same-origin); se durante la finestra sono
   state rimosse URI legacy, ripristinarle.
4. **Riabilita scritture ed enqueue sul blu** — sull'URL **del deployment legacy registrato**
   (`deployments.legacyVercelDeployment`, es. `https://<legacy>.vercel.app`), **mai** sull'host
   pubblico: durante la propagazione del DNS `ceremly.com` può ancora risolvere sul Worker, che
   serve la stessa route e cambierebbe la modalità del verde (o fallirebbe) lasciando il blu in
   read-only, e la verifica darebbe un falso positivo.
   ```bash
   LEGACY=https://<legacy>.vercel.app      # dal blocco evidenze / registro
   curl -fsS -X DELETE "$LEGACY/api/admin/site-mode" -H @<(admin_hdr)   # cutover.md 0.25
   # (o POST {"mode":"active"} se l'env di Vercel non è `active`)
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$LEGACY/api/public/invite/x/rsvp"   # non più 503
   ```
   Con la modalità `active` tornano le scritture, l'enqueue QStash e i cron Vercel (il deploy
   legacy li ha ancora: `legacy-vercel-final`, sul branch `legacy-vercel`). Solo quando il DNS è propagato si ripete la
   verifica anche sull'host pubblico.
5. **Convex** va in `maintenance` (`npx convex run --prod siteSettings:set
   '{"mode":"maintenance","reason":"rollback <ticket>"}'`) e **non** è authority: i dati
   importati restano come copia inerte e verranno riscritti dal prossimo full/delta. Nessuna
   cancellazione nella finestra. In `maintenance` cron e job Convex sono no-op (C2): nessun
   reminder, purge, cleanup o delete R2 parte dalla copia stantia, per quanto a lungo resti lì.
6. **Sessioni**: se il passo 7 era stato fatto, gli utenti rifanno il login sul blu (atteso).
7. **Incidente**: registrare in `cutover.md` (Registro) e in un record d'incidente: ora di inizio
   e fine, passo raggiunto, trigger, report del preflight/reconcile/smoke, decisione, prossimo
   tentativo. Nessun segreto nel record.

## §B — Dopo le prime write Convex: rollback automatico vietato

Convex **resta authority**. Il blu resta in `maintenance` (mai `active`: sarebbe doppia scrittura
con dati divergenti).

- Si **corregge in avanti**: fix del codice sul verde (deploy Worker/Convex), riconciliazione
  operatore (`reconcile-creem.ts`, console admin), re-invio di job/email dalla console.
- Un ritorno a Neon è possibile solo come **migrazione inversa approvata**: progettata, provata su
  staging, con export delle write Convex post-cutover e verifica, e con un GO umano dedicato. Non è
  una procedura di questo runbook e non si improvvisa nella finestra.
- Il DNS non si tocca finché la decisione non è presa: spostarlo sul blu esporrebbe dati vecchi e
  accetterebbe scritture su una sorgente che non è più la verità.
- Registrare l'incidente come in §A.7.

## Cosa rende possibile il rollback (da tenere vivo fino al Task 19)

- il branch `legacy-vercel` e il tag `legacy-vercel-final` (un suo commit, **mai** un commit di
  `main`: final review C1) deployabili su Vercel (preset `vercel`, cron Vercel inclusi: lo Step 5
  del piano li rimuove **solo** da `main`); il preflight verifica che il tag sia il commit costruito
  e che non contenga `e6bfe5d`;
- il deployment Vercel di produzione non cancellato, le env Vercel intatte;
- il branch Neon di produzione intatto più il branch di backup pre-cutover;
- il toggle legacy `/api/admin/site-mode` sempre raggiungibile: in `maintenance-readonly` è una
  delle poche scritture ammesse (`READONLY_ALLOWED_WRITES`), in ogni altra modalità le API admin
  sono esenti dal gate.
