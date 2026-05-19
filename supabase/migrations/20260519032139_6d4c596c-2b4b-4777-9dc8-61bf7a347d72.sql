CREATE OR REPLACE FUNCTION public.get_user_room_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT room_id
  FROM public.room_members
  WHERE user_id = _user_id
  UNION
  SELECT id
  FROM public.rooms
  WHERE created_by = _user_id
$$;

CREATE OR REPLACE FUNCTION public.user_room_ids_array(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  FROM (
    SELECT room_id AS id
    FROM public.room_members
    WHERE user_id = _user_id
    UNION
    SELECT id
    FROM public.rooms
    WHERE created_by = _user_id
  ) rooms_for_user
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_room_ids(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_room_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_room_ids(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.user_room_ids_array(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_room_ids_array(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_room_ids_array(uuid) TO authenticated;