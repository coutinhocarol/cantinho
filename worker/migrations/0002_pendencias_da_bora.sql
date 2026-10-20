-- Pendências da Bora: dia da última repriorização das tarefas e compromissos que passaram sem ser
-- marcados como feitos (ficam aqui até a exclusão ser confirmada).
-- A lista "compras" saiu do app: os itens antigos dela são apagados.

DELETE FROM list_items WHERE list_name = 'compras';

CREATE TABLE user_state (
	user_id UUID NOT NULL,
	reprio_day DATE,
	PRIMARY KEY (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE user_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE missed_events (
	user_id UUID NOT NULL,
	id VARCHAR(64) NOT NULL,
	event_id VARCHAR(64) NOT NULL,
	title TEXT NOT NULL,
	date DATE NOT NULL,
	all_day BOOLEAN NOT NULL,
	start_time TIME WITHOUT TIME ZONE,
	end_time TIME WITHOUT TIME ZONE,
	repeat VARCHAR(16) NOT NULL,
	notes TEXT NOT NULL,
	task_ids JSONB DEFAULT '[]' NOT NULL,
	PRIMARY KEY (user_id, id),
	CONSTRAINT ck_missed_repeat CHECK (repeat in ('none','daily','weekly','monthly','yearly')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE missed_events ENABLE ROW LEVEL SECURITY;
