-- Allow anyone to delete votes (same trust level as INSERT — no player auth exists)
create policy "anyone can delete votes" on votes
  for delete using (true);
