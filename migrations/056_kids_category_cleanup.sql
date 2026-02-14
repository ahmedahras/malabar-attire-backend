-- Remove style-based categories from Kids hierarchy
-- Keep Women/Men Ethnic untouched.

DELETE FROM product_categories
WHERE gender = 'KIDS'
  AND name ILIKE '%ethnic%';

