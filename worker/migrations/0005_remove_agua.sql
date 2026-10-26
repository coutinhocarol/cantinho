-- A água saiu do app. user_state passa a indicar que o usuário já salvou algo (antes era a linha de water).

INSERT INTO user_state (user_id) SELECT user_id FROM water ON CONFLICT (user_id) DO NOTHING;

DROP TABLE water;
