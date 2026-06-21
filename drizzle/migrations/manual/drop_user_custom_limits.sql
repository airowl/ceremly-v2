-- MANUALE — drop tabella user_custom_limits (rimozione modello pricing B2B legacy)
--
-- La tabella `user_custom_limits` conteneva gli override admin dei limiti B2B
-- (max_organizations / storage_mb / team_members), rimossi insieme ai gate
-- org/team con il passaggio al solo modello Ceremly (Free/Celebration/Atelier).
-- Lo schema Drizzle e tutto il codice che la referenziava sono già stati rimossi:
-- la tabella orfana resta innocua finché non viene droppata.
--
-- ⚠️  Volutamente FUORI da drizzle/migrations/ e NON registrata in _journal.json:
--   1. il journal del branch dev è disallineato rispetto allo stato reale del DB
--      (alcune migrazioni applicate via SQL diretto / db:push) — wireare un nuovo
--      step nel journal rotto propagherebbe il disallineamento;
--   2. tenerla qui (path `manual/`, senza prefisso numerico) evita la collisione
--      con un futuro `pnpm db:generate`, che riemetterebbe un `0009_*` nel root.
--
-- Applicare a mano su ogni ambiente (dev/staging/prod) via psql o Neon SQL editor:

DROP TABLE IF EXISTS "user_custom_limits" CASCADE;
