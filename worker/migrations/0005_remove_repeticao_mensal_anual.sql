-- Compromissos só se repetem por dia ou por semana. Os que eram mensais ou anuais viram únicos,
-- mantendo a data da próxima ocorrência.

UPDATE events SET repeat = 'none' WHERE repeat IN ('monthly', 'yearly');
UPDATE missed_events SET repeat = 'none' WHERE repeat IN ('monthly', 'yearly');

ALTER TABLE events DROP CONSTRAINT ck_events_repeat;
ALTER TABLE events ADD CONSTRAINT ck_events_repeat CHECK (repeat in ('none','daily','weekly'));

ALTER TABLE missed_events DROP CONSTRAINT ck_missed_repeat;
ALTER TABLE missed_events ADD CONSTRAINT ck_missed_repeat CHECK (repeat in ('none','daily','weekly'));
