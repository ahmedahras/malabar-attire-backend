-- Kids category list cleanup for product upload.
-- 1) Remove redundant duplicate categories: Kids Boy / Kids Girl (only if not a parent).
-- 2) Mark age groups as selectable by setting type = 'CATEGORY'.

-- Drop any product mappings pointing to the redundant records (safe no-op if none)
DELETE FROM product_category_map
WHERE category_id IN (
  SELECT id
  FROM product_categories
  WHERE gender = 'KIDS'
    AND name IN ('Kids Boy', 'Kids Girl')
);

-- Delete redundant Kids Boy/Kids Girl only when they have no children
DELETE FROM product_categories pc
WHERE pc.gender = 'KIDS'
  AND pc.name IN ('Kids Boy', 'Kids Girl')
  AND NOT EXISTS (
    SELECT 1
    FROM product_categories child
    WHERE child.parent_id = pc.id
  );

-- Mark the 8 remaining kids age groups as selectable categories
UPDATE product_categories
SET type = 'CATEGORY'
WHERE gender = 'KIDS'
  AND slug IN (
    'boy-toddler',
    'boy-little-kids',
    'boy-kids',
    'boy-pre-teens',
    'girl-toddler',
    'girl-little-kids',
    'girl-kids',
    'girl-pre-teens'
  );

