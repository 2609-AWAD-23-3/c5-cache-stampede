-- Chạy một lần khi Postgres khởi tạo volume mới.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Mật khẩu dev, chỉ dùng cho môi trường local của benchmark.
CREATE ROLE app_user LOGIN PASSWORD 'app_pass';
CREATE ROLE bench_ro LOGIN PASSWORD 'bench_pass';
GRANT pg_read_all_stats TO bench_ro;
GRANT CONNECT ON DATABASE shop TO app_user, bench_ro;
