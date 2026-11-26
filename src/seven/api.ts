import { navigationHeaders } from '../auth/navigationSession';
export async function sevenRequest<T>(query='',method='GET',body?:unknown):Promise<T> {
  const response=await fetch('/api/seven'+query,{method,credentials:'same-origin',cache:'no-store',headers:{...navigationHeaders(),'Content-Type':'application/json'},body:body===undefined ? undefined : JSON.stringify(body)});
  if(response.status===401) window.dispatchEvent(new Event('auth-expired'));
  const data=await response.json();
  if(!response.ok) throw new Error(data.error ?? 'Não foi possível acessar os comprovantes.');
  return data;
}
