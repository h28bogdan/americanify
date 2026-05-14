-- Remove old categories (and their votes) that no longer exist in the app
delete from votes where category_id in ('mvp', 'style_tag', 'biggest_weakness');
delete from vote_categories where id in ('mvp', 'style_tag', 'biggest_weakness');

-- Add new categories introduced in Phase 23
insert into vote_categories (id, name, is_public) values
  ('best_dressed',  'Best Dressed',   true),
  ('most_improved', 'Most Improved',  true),
  ('the_hammer',    'The Hammer',     true),
  ('the_wall',      'The Wall',       true)
on conflict (id) do nothing;
