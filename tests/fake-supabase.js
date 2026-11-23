window.__calls=[];
window.supabase={createClient(){const st={user:null,fid:null,code:null};window.__st=st;
 const q=(table)=>{const o={_t:table,select(){return o},eq(){return o},in(){return o},gte(){return o},lt(){return o},order(){return o},upsert(){__calls.push('upsert:'+table);return Promise.resolve({error:null})},update(){return o},
  then(res){let data=[];if(table==='membros'&&st.fid)data=[{user_id:'u-dono',papel:'responsavel',apelido:''},...(st.user&&st.user.id!=='u-dono'?[{user_id:st.user.id,papel:'membro',apelido:''}]:[{user_id:'u-conv',papel:'membro',apelido:''}])];
   if(table==='perfis'&&st.fid)data=[{id:'u-dono',nome:'Jack Alcântara'},{id:'u-conv',nome:'Karen'},{id:st.user&&st.user.id,nome:'Lorenzo'}];
   return Promise.resolve({data,error:null}).then(res)}};return o};
 return {auth:{onAuthStateChange(){},getSession:async()=>({data:{session:st.user?{user:st.user}:null}}),
  signInWithOtp:async(a)=>{__calls.push('otp:'+a.email);return {data:{},error:null}},
  verifyOtp:async(a)=>{__calls.push('verify:'+a.token);if(a.token!=='12345678')return {data:{},error:{message:'Token has expired or is invalid'}};st.user={id:'u-dono',email:a.email};return {data:{user:st.user,session:{user:st.user}},error:null}},
  signInAnonymously:async()=>{__calls.push('anon');st.user={id:'u-anon',email:'',is_anonymous:true};return {data:{user:st.user},error:null}},
  signOut:async()=>{st.user=null;return {error:null}}},
 from:q,channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){},
 rpc:async(fn,args)=>{__calls.push('rpc:'+fn+':'+JSON.stringify(args||{}));
  if(fn==='minha_familia')return {data:st.fid,error:null};
  if(fn==='criar_familia'){st.fid='f1';return {data:'f1',error:null}}
  if(fn==='gerar_convite')return {data:'482913',error:null};
  if(fn==='aceitar_convite'){if(args.p_codigo==='482913'){st.fid='f1';return {data:'f1',error:null}}return {data:null,error:null}}
  return {data:null,error:null}}}}};
