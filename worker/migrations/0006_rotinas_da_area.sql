-- Uma área passa a ter uma ou mais rotinas, cada uma com a própria periodicidade e a própria última
-- checagem. Os dados de periodicidade saem de areas e vão para routines (uma rotina sem nome por área,
-- com o mesmo id da área); as checagens passam a apontar para a rotina.

CREATE TABLE routines (
	user_id UUID NOT NULL,
	id VARCHAR(64) NOT NULL,
	area_id VARCHAR(64) NOT NULL,
	name TEXT DEFAULT '' NOT NULL,
	period_type VARCHAR(16) NOT NULL,
	interval_days INTEGER,
	weekly_days SMALLINT[],
	weekly_time TIME WITHOUT TIME ZONE,
	last_done TIMESTAMP WITH TIME ZONE,
	force_due TIMESTAMP WITH TIME ZONE,
	sort_order INTEGER DEFAULT 0 NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (user_id, id),
	CONSTRAINT ck_routines_period_type CHECK (period_type in ('interval','weekly')),
	CONSTRAINT ck_routines_period_fields CHECK ((period_type = 'interval' and interval_days >= 1) or (period_type = 'weekly' and weekly_time is not null)),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id, area_id) REFERENCES areas (user_id, id) ON DELETE CASCADE
);

CREATE INDEX ix_routines_area ON routines (user_id, area_id);

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

INSERT INTO routines (user_id, id, area_id, period_type, interval_days, weekly_days, weekly_time, last_done, force_due, created_at)
SELECT user_id, id, id, period_type, interval_days, weekly_days, weekly_time, last_done, force_due, created_at FROM areas;

ALTER TABLE area_checks ADD COLUMN routine_id VARCHAR(64);
UPDATE area_checks SET routine_id = area_id;
ALTER TABLE area_checks DROP COLUMN area_id;
ALTER TABLE area_checks ALTER COLUMN routine_id SET NOT NULL;
ALTER TABLE area_checks ADD FOREIGN KEY (user_id, routine_id) REFERENCES routines (user_id, id) ON DELETE CASCADE;
CREATE INDEX ix_area_checks_routine ON area_checks (user_id, routine_id);

ALTER TABLE areas DROP COLUMN period_type, DROP COLUMN interval_days, DROP COLUMN weekly_days,
	DROP COLUMN weekly_time, DROP COLUMN last_done, DROP COLUMN force_due;
