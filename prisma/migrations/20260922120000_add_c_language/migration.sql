-- Add C as a 5th problem language (CodeBox Judge0 ID 50, gcc harness).
-- ENUM ADD VALUE is instant and non-blocking; no table rewrite. Safe to apply
-- on a live database; previously stored values are untouched.
ALTER TYPE "ProblemLanguage" ADD VALUE 'C';
