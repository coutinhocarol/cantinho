-- Tabelas do Cantinho. RLS ligado e sem policies: a API REST pública do Supabase não enxerga nada;
-- só o Worker (role postgres) acessa.

CREATE TABLE users (
	id UUID NOT NULL, 
	email VARCHAR(320) NOT NULL, 
	password_hash TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE TABLE areas (
	user_id UUID NOT NULL, 
	id VARCHAR(64) NOT NULL, 
	name TEXT NOT NULL, 
	emoji TEXT NOT NULL, 
	color VARCHAR(16), 
	period_type VARCHAR(16) NOT NULL, 
	interval_days INTEGER, 
	weekly_days SMALLINT[], 
	weekly_time TIME WITHOUT TIME ZONE, 
	last_done TIMESTAMP WITH TIME ZONE, 
	ok_at TIMESTAMP WITH TIME ZONE, 
	force_due TIMESTAMP WITH TIME ZONE, 
	accepts_tasks BOOLEAN DEFAULT 'true' NOT NULL, 
	sort_order INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (user_id, id), 
	CONSTRAINT ck_areas_period_type CHECK (period_type in ('interval','weekly')), 
	CONSTRAINT ck_areas_period_fields CHECK ((period_type = 'interval' and interval_days >= 1) or (period_type = 'weekly' and weekly_time is not null)), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

CREATE TABLE events (
	user_id UUID NOT NULL, 
	id VARCHAR(64) NOT NULL, 
	title TEXT NOT NULL, 
	date DATE NOT NULL, 
	origin DATE NOT NULL, 
	all_day BOOLEAN NOT NULL, 
	start_time TIME WITHOUT TIME ZONE, 
	end_time TIME WITHOUT TIME ZONE, 
	repeat VARCHAR(16) NOT NULL, 
	notes TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (user_id, id), 
	CONSTRAINT ck_events_repeat CHECK (repeat in ('none','daily','weekly','monthly','yearly')), 
	CONSTRAINT ck_events_start_required CHECK (all_day or start_time is not null), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE TABLE list_items (
	user_id UUID NOT NULL, 
	id VARCHAR(64) NOT NULL, 
	list_name VARCHAR(16) NOT NULL, 
	title TEXT NOT NULL, 
	kind VARCHAR(16), 
	note TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (user_id, id), 
	CONSTRAINT ck_list_name CHECK (list_name in ('compras','indicacoes','hobbies')), 
	CONSTRAINT ck_list_kind CHECK (kind is null or kind in ('filme','serie','livro','outro')), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_list_items_list ON list_items (user_id, list_name);

ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE water (
	user_id UUID NOT NULL, 
	goal INTEGER NOT NULL, 
	day DATE, 
	count INTEGER NOT NULL, 
	PRIMARY KEY (user_id), 
	CONSTRAINT ck_water_goal CHECK (goal between 1 and 30), 
	CONSTRAINT ck_water_count CHECK (count >= 0), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE water ENABLE ROW LEVEL SECURITY;

CREATE TABLE area_checks (
	id SERIAL NOT NULL, 
	user_id UUID NOT NULL, 
	area_id VARCHAR(64) NOT NULL, 
	checked_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id, area_id) REFERENCES areas (user_id, id) ON DELETE CASCADE
);

CREATE INDEX ix_area_checks_area ON area_checks (user_id, area_id);

ALTER TABLE area_checks ENABLE ROW LEVEL SECURITY;

CREATE TABLE event_done_dates (
	user_id UUID NOT NULL, 
	event_id VARCHAR(64) NOT NULL, 
	done_date DATE NOT NULL, 
	PRIMARY KEY (user_id, event_id, done_date), 
	FOREIGN KEY(user_id, event_id) REFERENCES events (user_id, id) ON DELETE CASCADE
);

ALTER TABLE event_done_dates ENABLE ROW LEVEL SECURITY;

CREATE TABLE tasks (
	user_id UUID NOT NULL, 
	id VARCHAR(64) NOT NULL, 
	title TEXT NOT NULL, 
	area_id VARCHAR(64), 
	event_id VARCHAR(64), 
	quad VARCHAR(16), 
	due DATE, 
	notes TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (user_id, id), 
	FOREIGN KEY(user_id, area_id) REFERENCES areas (user_id, id) ON DELETE SET NULL (area_id), 
	FOREIGN KEY(user_id, event_id) REFERENCES events (user_id, id) ON DELETE SET NULL (event_id), 
	CONSTRAINT ck_tasks_quad CHECK (quad is null or quad in ('fazer','agendar','delegar','eliminar')), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_tasks_area ON tasks (user_id, area_id);

CREATE INDEX ix_tasks_event ON tasks (user_id, event_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
