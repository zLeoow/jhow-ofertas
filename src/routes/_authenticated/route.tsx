import { createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '@/integrations/supabase/client'
import { Shell } from '@/components/jhow/Shell'
export const Route=createFileRoute('/_authenticated')({ssr:false,beforeLoad:async()=>{const {data:{user},error}=await supabase.auth.getUser();if(error||!user)throw redirect({to:'/login'});const role=await supabase.rpc('has_role',{_user_id:user.id,_role:'admin'});if(role.error||!role.data)throw redirect({to:'/sem-acesso'});return {user}},component:Shell})