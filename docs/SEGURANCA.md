# Segurança do VaiDeBike — o que foi feito e o que você precisa fazer

Nenhum sistema é "100% seguro". O objetivo é fechar as portas óbvias, limitar abusos e ter um plano se algo vazar.

## 1. Verificação de senhas e chaves no repositório
- Arquivos e histórico do GitHub foram varridos: **nenhuma senha, chave ou string de banco real** está no código. O único `mongodb+srv://USUARIO:SENHA@...` é um exemplo no `PUBLICAR.md`.
- O `.gitignore` **não bloqueava `.env`**: corrigido (agora ignora `.env`, `*.pem`, `*.key`, `*.keystore`). Nunca coloque senha em arquivo do repositório; use as variáveis da Vercel.
- Resquício da plataforma anterior (`.emergent/`) já foi removido.

## 2. Correções feitas no código
| Risco | Correção |
|---|---|
| Rotas sobras do modelo inicial (`/api/status`) deixavam **qualquer pessoa gravar e ler** no banco | Removidas |
| Contas demo com senha pública `senha123` | Login delas bloqueado; seed gera senha aleatória; rota `/admin/remove-demo` apaga as contas |
| Tentar senhas sem limite (força bruta) | Login: 8 erros por conta e 20 por IP a cada 15 min; cadastro, "esqueci a senha" e troca por link também limitados |
| Chute do `SEED_TOKEN` nas rotas `/admin` | 10 erros por hora por IP |
| Abuso de `/route` e `/geocode` (serviços gratuitos de terceiros) | Limite por IP |
| CORS aberto (`*`) com cookies | Sem curinga; só as origens de `CORS_ORIGINS` (e `localhost` em desenvolvimento) |
| Sessões guardadas em texto no banco | Agora só o hash: se o banco vazar, as sessões não servem. **Todos terão de entrar de novo uma vez** |
| Hash de senha fraco (29 mil voltas) | 600 mil voltas; senhas antigas são refeitas sozinhas no próximo login |
| Senha mínima de 6 caracteres | Mínimo de 8 (site e API) |
| `/api/health` podia mostrar usuário e servidor do banco (`HEALTH_DEBUG`) | Removido; só diz se o banco está no ar |
| Cabeçalhos de segurança ausentes | API e site: nosniff, anti-iframe, HSTS, política de referência, câmera/localização só do próprio site; dados pessoais sem cache |
| Resposta de login com tempo diferente para e-mail inexistente | Mesmo custo de tempo nos dois casos |

Já estava correto e foi mantido: e-mail nunca aparece para outros usuários, cookie `httpOnly` + `Secure`, todas as rotas de equipe exigem conta de gestor, fotos validadas (formato e assinatura), busca com texto escapado, link de recuperação de uso único e de 1 hora, exclusão de conta (LGPD).

## 3. O que VOCÊ precisa fazer (nenhum código resolve isso)
1. **Vercel → variáveis (projeto da API):**
   - `MODERATOR_EMAILS` = só o seu e-mail.
   - `CORS_ORIGINS` = o endereço do site (ex.: `https://seu-site.vercel.app`).
   - **Apague** `HEALTH_DEBUG` e, depois dos imports, `SEED_TOKEN`.
   - Nunca coloque `ALLOW_DEMO_LOGIN=1` em produção.
2. **Depois do deploy**, abra uma vez `/api/admin/remove-demo?token=...` (apaga as contas demo) e então apague o `SEED_TOKEN`.
3. **MongoDB Atlas:** usuário do app com permissão só no banco `vaidebike` (não "admin"), senha longa e aleatória. Se a string de conexão já foi enviada por chat, e-mail ou print para alguém, **troque a senha** do usuário e atualize `MONGO_URL` na Vercel. Ative backups.
4. **Verificação em duas etapas (2FA)** em: GitHub, Vercel, MongoDB Atlas, Cloudflare e no e-mail Google usado nos serviços. É a proteção mais importante contra invasão.
5. **GitHub:** ative em Settings → Code security: *Secret scanning*, *Push protection* e *Dependabot alerts*. Em Settings → Branches, proteja a `main` (exigir pull request).
6. **Remova o projeto `vaidebike` do Cloudflare** se não for usar (ele lê o seu repositório à toa).
7. Se um dia uma senha ou chave aparecer no GitHub, **troque-a imediatamente** (apagar o arquivo não basta: o histórico guarda).

## 4. Limites que você deve saber
- Não testei nada rodando aqui (sem como subir o servidor). Rode os testes do `backend/tests` e experimente login, cadastro e mapa na prévia da Vercel antes de mesclar.
- Limite de tentativas depende do IP informado pela Vercel; atrás de redes compartilhadas (escola, Wi-Fi público) várias pessoas dividem o mesmo limite.
- Fotos de alertas são públicas para quem tem o link (código aleatório). Não fotografe rostos nem placas.
- Falta ainda: política de privacidade publicada, política de segurança de conteúdo (CSP) no site e uma auditoria externa. Recomendado antes do lançamento público.
- O chat é público entre usuários logados, por desenho: avise para não compartilharem dados pessoais nele.
