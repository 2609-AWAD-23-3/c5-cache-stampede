#!/bin/sh
# Schema + seed xác định (không dùng random()). Chạy sau 01-*.sql.
# Số dòng reviews lấy từ biến SEED_REVIEWS (mặc định 300000, calibrate trên máy chuẩn 19/11: query p50 33 ms) để chỉnh độ nặng query.
# Lưu ý: file này được entrypoint của image postgres `source`, nên không dùng `set -u`.
: "${SEED_REVIEWS:=300000}"

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
CREATE TABLE products (
  id          int PRIMARY KEY,
  name        text NOT NULL,
  price_cents int  NOT NULL
);

-- Cố ý KHÔNG có index trên reviews.product_id (xem CONTRACT.md mục 3).
CREATE TABLE reviews (
  id         int PRIMARY KEY,
  product_id int NOT NULL,
  rating     int NOT NULL CHECK (rating BETWEEN 1 AND 5)
);

INSERT INTO products (id, name, price_cents)
SELECT g, 'Product ' || g, 999 + g * 1000 FROM generate_series(1, 10) AS g;

INSERT INTO reviews (id, product_id, rating)
SELECT g, 1 + (g % 10), 1 + (((g / 10) * 7) % 5)
FROM generate_series(1, ${SEED_REVIEWS}) AS g;

ANALYZE;

GRANT SELECT ON products, reviews TO app_user;
-- Runner (bench_ro) đếm số dòng seed bằng count(*) để ghi vào config.json (xem benchmark/src/stats.js).
GRANT SELECT ON reviews TO bench_ro;
SQL
