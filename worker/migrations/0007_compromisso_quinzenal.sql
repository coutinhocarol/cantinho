-- Compromissos podem se repetir a cada duas semanas ('biweekly').

ALTER TABLE events DROP CONSTRAINT ck_events_repeat;
ALTER TABLE events ADD CONSTRAINT ck_events_repeat CHECK (repeat in ('none','daily','weekly','biweekly','monthly','yearly'));

ALTER TABLE missed_events DROP CONSTRAINT ck_missed_repeat;
ALTER TABLE missed_events ADD CONSTRAINT ck_missed_repeat CHECK (repeat in ('none','daily','weekly','biweekly','monthly','yearly'));
