# Rollback del cutover (Task 17)

**Stato:** regole scritte, mai eseguite. Si applicano durante il Task 18 (runbook in
[`cutover.md`](./cutover.md)).

La domanda che decide tutto è una sola: **Convex ha già ricevuto scritture che non esistono su
Neon?** Finché la risposta è no, tornare al blu non perde nulla e il rollback è completo. Dopo,
tornare al blu significherebbe buttare dati reali — quindi non si torna indietro in automatico.

## Definizione misurabile di "prima write Convex"

Una scrittura sul deployment Convex di produzione **non prodotta dal pipeline di import** (le
righe dell'import portano `legacyId` e sono ricostruibili da Neon in qualunque momento). Include:
azioni utente dalla SPA o dalle API del Worker, webhook Creem (dopo il passo 8.2), webhook Resend
(dopo il DNS), job e cron Convex che mutano dati di dominio.

Si **misura**, non si presume:

```bash
pnpm tsx scripts/migration/reconcile.ts --manifest .migration-cutover/delta/manifest.json \
  --out .migration-cutover/reconcile-check.json
```

- `exit 0`, nessuna riga `only_in_target`, nessun `webhookEvents` nuovo rispetto al registro del
  passo 6 → **nessuna write**: vale §A.
- altrimenti → **write avvenute**: vale §B.

Perché misurare: `maintenance-readonly` è applicata dal Worker, non dalle mutation Convex (cutover
B4). Finché B4 non è risolto con una guardia server-side, "abbiamo impostato la read-only" non
implica "nessuno ha scritto".

In caso di dubbio (reconcile non eseguibile, report ambiguo) si assume §B.

## §A — Prima delle prime write Convex: rollback completo consentito

Condizioni: il passo 10 del runbook non è stato eseguito **e** la misura sopra dice "nessuna write".
Trigger tipici: preflight rosso nella finestra, delta+reconcile oltre 15 min, reconcile `exit 1`,
checklist manuale fallita, smoke read-only `exit 1`, finestra oltre 30 min.

Ordine (inverso rispetto al runbook, ognuno registrato con ora UTC):

1. **DNS**: il record di `ceremly.com` torna al target Vercel registrato
   (`deployments.legacyVercelDeployment`). La propagazione è bounded dal TTL approvato.
2. **Webhook Creem**: endpoint di nuovo su `https://ceremly.com/api/auth/creem/webhook` con il
   segreto legacy. Eventi arrivati a Convex nel frattempo (se il passo 8.2 era fatto) sono **write
   Convex** → non si è in §A: ricontrollare la misura.
3. **Callback Google**: nessun cambio di path (proxy same-origin); se durante la finestra sono
   state rimosse URI legacy, ripristinarle.
4. **Riabilita scritture ed enqueue sul blu**:
   ```bash
   curl -fsS -X DELETE "https://ceremly.com/api/admin/site-mode" -H "X-Admin-API-Key: $NUXT_ADMIN_API_KEY"
   # (o POST {"mode":"active"} se l'env di Vercel non è `active`)
   ```
   Con la modalità `active` tornano le scritture, l'enqueue QStash e i cron Vercel (il deploy
   legacy li ha ancora: `legacy-vercel-final`). Verifica: `POST /api/public/invite/x/rsvp` non
   risponde più `503`.
5. **Convex** va in `maintenance` (`npx convex run --prod siteSettings:set
   '{"mode":"maintenance","reason":"rollback <ticket>"}'`) e **non** è authority: i dati
   importati restano come copia inerte e verranno riscritti dal prossimo full/delta. Nessuna
   cancellazione nella finestra.
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

- il commit/tag `legacy-vercel-final` deployabile su Vercel (preset `vercel`, cron Vercel inclusi:
  lo Step 5 del piano li rimuove **solo** dal target);
- il deployment Vercel di produzione non cancellato, le env Vercel intatte;
- il branch Neon di produzione intatto più il branch di backup pre-cutover;
- il toggle legacy `/api/admin/site-mode` sempre raggiungibile: in `maintenance-readonly` è una
  delle poche scritture ammesse (`READONLY_ALLOWED_WRITES`), in ogni altra modalità le API admin
  sono esenti dal gate.
