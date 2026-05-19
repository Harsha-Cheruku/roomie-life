REVOKE EXECUTE ON FUNCTION public.is_room_creator(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_room_creator(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_room_creator(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_room_admin(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_room_admin(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_room_admin(uuid, uuid) TO authenticated;