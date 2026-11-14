# Login e sincronização em nuvem (Supabase)

O OmniDesign Studio funciona 100% offline. A conta é opcional e serve para sincronizar
projetos, assets (com os arquivos), pastas da biblioteca e versões entre dispositivos.

## 1. Criar o projeto
1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor**, cole o conteúdo de [`supabase/migrations/0001_omnidesign_sync.sql`](../supabase/migrations/0001_omnidesign_sync.sql) e execute.
   O script pode ser executado mais de uma vez. Ele cria:
   - a tabela `public.omni_records` com Row Level Security (cada usuário só vê e altera os próprios registros);
   - um gatilho de concorrência otimista (toda atualização incrementa a revisão em exatamente 1);
   - o bucket privado `omni-assets` e as políticas de acesso por usuário (arquivos imutáveis, endereçados pelo SHA-256).
3. Em **Authentication → Sign In / Providers**, mantenha **Email** habilitado.
   - Com "Confirm email" ligado, o usuário confirma o e-mail antes do primeiro login (recomendado).
4. Em **Authentication → URL Configuration**, defina a *Site URL* e adicione as *Redirect URLs* onde o app roda
   (ex.: `https://carlosandre1514-prog.github.io/OminiDesignStudio/account` e `http://localhost:5173/account`). Elas são usadas na confirmação de e-mail e na redefinição de senha.

## 2. Conectar o app
- **Pela interface:** abra **Conta e nuvem**, cole a *Project URL* e a chave **anon / publishable**
  (Project Settings → API) e salve. A configuração fica neste dispositivo.
- **No build:** copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

> A chave pública foi feita para ficar no navegador: quem protege os dados são as políticas RLS do script.
> Chaves secretas (`service_role` / `sb_secret_…`) são recusadas pelo app.

## 3. E-mails de verdade (antes de abrir para outras pessoas)
O envio de e-mails padrão do Supabase só entrega para membros da equipe do projeto e tem limite baixo por hora.
Para confirmação de cadastro e redefinição de senha de qualquer pessoa, configure um provedor em
**Authentication → Emails → SMTP Settings** (ex.: Resend, Brevo, SendGrid) e mantenha **Confirm email** ligado.

## 4. Como a sincronização funciona
- Cada registro tem uma **revisão** e um **hash** do conteúdo. O app guarda, por conta, o último estado
  em que o dispositivo e a nuvem concordaram.
- Alterações só locais são enviadas com escrita condicional ("só grave se a revisão ainda for N").
  Alterações só remotas são baixadas. Se os dois lados mudaram, o item vira um **conflito**:
  nada é sobrescrito até você escolher **manter deste dispositivo**, **manter da nuvem**
  (a versão local de um projeto é guardada como ponto de restauração) ou **manter ambos** (cópia).
- Exclusões viram "lápides" (`deleted = true`) para chegar aos outros dispositivos.
- Arquivos de assets ficam em `omni-assets/<usuário>/blobs/<sha256>`; registros muito grandes
  (> 2 MB) em `omni-assets/<usuário>/payloads/<sha256>.json`. Tudo que é baixado tem o hash conferido.
- Na primeira vez que uma conta sincroniza em um dispositivo que já tem dados locais, o app pede
  confirmação antes de enviá-los.
- Sincroniza automaticamente ao entrar, a cada N minutos, alguns segundos depois de alterações,
  ao voltar a ficar online e ao reabrir o app; e manualmente em **Sincronizar agora**.
- Sair da conta não apaga nada deste dispositivo.

## 5. Testes
- `npm run test:sql` — aplica o script num PostgreSQL 16 local (com substitutos mínimos dos esquemas
  `auth`/`storage` do Supabase) e verifica RLS, revisões, lápides e regras do Storage.
- `npm test` — motor de sincronização (dois dispositivos, conflitos, exclusões, assets, isolamento) e o adaptador Supabase.
- `NODE_USE_ENV_PROXY=1 SUPABASE_URL=… SUPABASE_ANON_KEY=… node e2e/cloud.mjs` — o mesmo fluxo contra um projeto
  Supabase real (cria contas descartáveis `omni-e2e-…@mailinator.com`; exige "Confirm email" desligado durante o teste),
  incluindo verificações de isolamento entre contas. Apague as contas de teste depois.
- `node e2e/cloud.mjs` — fluxo completo no navegador com o supabase-js real contra
  `e2e/fake-supabase.mjs`, um servidor local que imita a API do Supabase usada pelo app.
