-- Horário de trabalho do entregador, por dia da semana (0=Domingo … 6=Sábado).
-- Cada dia pode estar ativo/inativo, com início, fim e uma parada de almoço opcional.
-- Usado para comparar com o primeiro AVAILABLE do dia (deliverer_status_history) e
-- medir pontualidade (adiantado/atrasado).
CREATE TABLE IF NOT EXISTS deliverer_work_schedules (
  deliverer_id UUID    NOT NULL REFERENCES deliverers(id) ON DELETE CASCADE,
  store_id     UUID    NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  day_of_week  INT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  active       BOOLEAN NOT NULL DEFAULT true,
  start_time   TIME    NOT NULL,
  end_time     TIME    NOT NULL,
  lunch_start  TIME,
  lunch_end    TIME,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deliverer_id, day_of_week)
);
