-- Storage policies for recordings bucket
-- Allow authenticated users to upload recordings
create policy "Authenticated users can upload recordings"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'recordings');

-- Allow authenticated users to read recordings
create policy "Authenticated users can read recordings"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'recordings');

-- Allow authenticated users to read TTS audio
create policy "Anyone can read TTS audio"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'tts-audio');
