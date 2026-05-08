-- Organizers are the only authenticated users in the app (coaches/event managers).
-- We reference auth.users so Supabase Auth owns the login, we own the profile.
create table organizers (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);

-- Row Level Security: organizers can only read and update their own profile.
alter table organizers enable row level security;

create policy "Organizer can read own profile"
  on organizers for select
  using (auth.uid() = id);

create policy "Organizer can update own profile"
  on organizers for update
  using (auth.uid() = id);

-- Automatically create an organizer profile when a new user signs up.
-- This trigger fires after Supabase Auth creates the auth.users record.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.organizers (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
