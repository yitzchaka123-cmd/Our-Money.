-- A spend's category must exist in `categories` (foreign key), but categories
-- arrive from three places: the seed list, RiseUp's labels and tracker names,
-- and whatever the couple types on the dashboard. Rather than make every write
-- path remember to register the label first, register it here, just before the
-- foreign key is checked.
create or replace function register_spend_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into categories (label, source)
  values (new.category, 'manual')
  on conflict (label) do nothing;
  return new;
end;
$$;

drop trigger if exists cash_spends_register_category on cash_spends;
create trigger cash_spends_register_category
  before insert or update of category on cash_spends
  for each row execute function register_spend_category();
