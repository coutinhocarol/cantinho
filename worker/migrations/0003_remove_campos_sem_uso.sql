-- Campos que nenhuma tela usa: a cor da área e a "dispensa" de checagem (nunca gravada pelo app).

ALTER TABLE areas DROP COLUMN color, DROP COLUMN ok_at;
