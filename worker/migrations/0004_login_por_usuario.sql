-- O login passa a ser por nome de usuário (3 a 30 letras minúsculas, números, ponto, hífen ou _), não por e-mail.

ALTER TABLE users RENAME COLUMN email TO username;
ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(30);
