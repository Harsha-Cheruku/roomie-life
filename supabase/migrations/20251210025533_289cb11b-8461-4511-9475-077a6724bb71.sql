-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- Storage policies for chat attachments
CREATE POLICY "Users can upload chat attachments" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'chat-attachments' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view chat attachments" ON storage.objects
FOR SELECT USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete their own attachments" ON storage.objects
FOR DELETE USING (
  bucket_id = 'chat-attachments' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);