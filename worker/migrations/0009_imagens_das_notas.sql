-- Fotos coladas nas notas. O texto da nota guarda só a referência ([[img:id]]); a imagem fica aqui.

CREATE TABLE note_images (
	user_id UUID NOT NULL,
	id VARCHAR(64) NOT NULL,
	mime VARCHAR(32) NOT NULL,
	data BYTEA NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (user_id, id),
	CONSTRAINT ck_note_images_mime CHECK (mime in ('image/jpeg','image/png','image/webp','image/gif')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

ALTER TABLE note_images ENABLE ROW LEVEL SECURITY;
