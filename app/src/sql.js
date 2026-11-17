// Nguồn duy nhất của query mục tiêu. Phải khớp từng ký tự với CONTRACT.md mục 3.
export const TARGET_SQL = `SELECT p.id, p.name, p.price_cents,
       COUNT(r.id)::int AS review_count,
       ROUND(AVG(r.rating), 3)::float AS avg_rating
FROM products p
LEFT JOIN reviews r ON r.product_id = p.id
WHERE p.id = $1
GROUP BY p.id`;
