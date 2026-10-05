import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { migrationProblems } from '@/scripts/lib/migration-guard';

const dir = join(__dirname, '..', 'supabase', 'migrations');

describe('migration guard', () => {
  it.each(readdirSync(dir).filter((f) => f.endsWith('.sql')))('passes the real migration %s', (file) => {
    expect(migrationProblems(readFileSync(join(dir, file), 'utf8'))).toEqual([]);
  });

  it.each([
    ['create table categories (id int);', 'outside the money schema'],
    ['create table if not exists public.thing (id int);', 'outside the money schema'],
    ['create index x on cash_spends (id);', 'index on a table outside money'],
    ['create extension if not exists pgcrypto;', 'extension'],
    ['create trigger t after insert on auth.users for each row execute function money.f();', 'Supabase Auth'],
    ['revoke all on all tables in schema public from anon;', 'schema other than money'],
    ['alter default privileges revoke execute on functions from public;', 'globally'],
    ['alter table family.notes add column x int;', 'outside money'],
    ['insert into categories values (1);', 'writes rows outside money'],
    ['update family.notes set x = 1;', 'writes rows outside money'],
    ['create table if not exists categories (id int);', 'outside the money schema'],
    ["select cron.schedule('nightly', '0 0 * * *', 'select 1');", 'money_ prefix'],
    ['drop schema family cascade;', 'schema other than money'],
  ])('refuses %s', (sql, problem) => {
    expect(migrationProblems(sql).join(' | ')).toContain(problem);
  });

  it.each([
    'create schema if not exists money;',
    'create table if not exists money.x (id int);',
    'alter table if exists money.x add column y int;',
    'create index if not exists x_idx on money.x (id);',
    'create trigger t before insert or update of category on money.cash_spends for each row execute function money.f();',
    'update money.x set id = 1;',
    "select cron.schedule('money_nightly', '0 0 * * *', 'select 1');",
  ])('accepts %s', (sql) => {
    expect(migrationProblems(sql)).toEqual([]);
  });

  it('ignores comments that mention other schemas', () => {
    expect(migrationProblems('-- never touch public or auth.users\ncreate table money.x (id int);')).toEqual([]);
  });
});
