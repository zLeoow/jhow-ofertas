import { useQuery } from '@tanstack/react-query'
import { loadAdmin } from './data'
export function useAdmin(){return useQuery({queryKey:['admin-data'],queryFn:loadAdmin,refetchOnWindowFocus:true})}