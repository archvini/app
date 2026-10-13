# Publicar o VaiDeBike (web + app móvel)

## 1. Banco (MongoDB Atlas) — uma vez
1. Network Access → **Add IP Address → Allow access from anywhere (`0.0.0.0/0`)** (a Vercel não tem IP fixo).
2. Database Access → usuário com senha (evite `@ : / ?` na senha, ou codifique em URL).
3. Connect → Drivers → copie a string `mongodb+srv://USUARIO:SENHA@cluster.../`.

## 2. Vercel — web + API no mesmo projeto
O `vercel.json` da raiz já declara os dois serviços (`backend` FastAPI e `frontend` Vite) e as rotas `/api/*`.
1. Settings → Environment Variables, **Environments = Production (e Preview)**:
   - `MONGO_URL` = string do Atlas
   - `DB_NAME` = `vaidebike`
   - (recomendado) `CORS_ORIGINS` = `https://seu-dominio.vercel.app`. Sem isso a API só aceita chamadas de outra origem em `localhost` (o site em si funciona, pois fala com a API pelo mesmo endereço).
2. **Redeploy** (variável nova só vale em deploy novo).
3. Teste `https://SEU-DOMINIO/api/health`:
   - `{"ok":true,"db":"up"}` → tudo certo.
   - `"db":"down"` + `error`: `ServerSelectionTimeoutError` = IP não liberado no Atlas ou URI errada; `OperationFailure` = usuário/senha.
4. Popular o banco (ciclovias, alertas, usuário demo) rodando uma vez no seu computador:
   `cd backend && MONGO_URL="<string do Atlas>" DB_NAME=vaidebike python seed.py`

## 3. Cadastro de usuários
`/register` cria a conta e já entra; `/login`, `/profile` (editar dados, trocar senha, histórico de pedais, excluir conta).
Sessão: cookie httpOnly (web) ou `Authorization: Bearer` (app móvel — o token vem no header `X-Session-Token`).
Ainda não existe "esqueci minha senha": exige um provedor de e-mail (Resend, SendGrid…).

## 4. Versão móvel
**A) PWA (já pronto, sem loja):** abrir o site no celular → *Adicionar à tela inicial* (Chrome/Android: "Instalar app").
Abre em tela cheia, com ícone e GPS. O GPS exige HTTPS (a Vercel já entrega).

**B) App nativo (Play Store / App Store) com Capacitor** — rodar no seu computador:
```bash
cd frontend
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/geolocation
npx cap init VaiDeBike app.vaidebike --web-dir dist
echo "VITE_API_URL=https://SEU-DOMINIO.vercel.app" > .env.production   # app nativo não tem origem em comum com a API
npm run build && npx cap add android && npx cap sync
npx cap open android      # gera APK/AAB no Android Studio (iOS exige Mac + Xcode: npx cap add ios)
```
No Android, adicione em `AndroidManifest.xml` as permissões `ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION`.
Com `VITE_API_URL` definido o frontend usa o token Bearer automaticamente (ver `src/lib/api.ts`).
Obs.: no iOS a vibração (`navigator.vibrate`) não existe; som, voz e alerta visual funcionam.

## 5. Popular o banco sem terminal (`/api/admin/seed`)
1. Na Vercel, crie a variável `SEED_TOKEN` com uma frase longa e secreta (Production) e faça o Redeploy.
2. Abra `https://SEU-DOMINIO/api/admin/seed?token=SUA_FRASE` → cria ciclovias, alertas de exemplo e contas demo.
3. Abra `https://SEU-DOMINIO/api/admin/snap?token=SUA_FRASE` (repita se `pendentes` ≠ 0) → ajusta as ciclovias às ruas.
4. Depois **apague a variável `SEED_TOKEN`**: sem ela, as duas rotas deixam de existir.
As contas demo (`demo@vaidebike.app`, `maria@…`, `joao@…`) agora **não conseguem entrar** (login bloqueado, a menos que `ALLOW_DEMO_LOGIN=1`) e o seed passou a gerar senha aleatória. Mesmo assim, apague-as: abra `https://SUA-API/api/admin/remove-demo?token=SEU_SEED_TOKEN` uma vez, antes de abrir o app ao público real. Os alertas de exemplo do mapa foram criados por elas.

## 6. Dois projetos na Vercel (API e site separados)
Se o projeto da API foi criado com Root Directory = `backend`, ele só serve `/api`. O site é um **segundo projeto**:
New Project → mesmo repositório → **Root Directory = `frontend`** (Framework: Vite) → Deploy. Sem variáveis de ambiente.
O `frontend/vercel.json` repassa `/api/*` para o projeto da API (se o domínio da API mudar, troque-o ali) e faz o fallback das rotas do React (`/map`, `/profile`…) para o `index.html`.
O build usa `vite build` direto (sem `tsc`), para um erro de tipo não derrubar o deploy.

## 7. Caixa de alertas (moderação)
Alertas de usuários comuns entram como **Em análise** e só aparecem no mapa depois de aprovados (o autor ganha +50 XP na aprovação, e o nome dele aparece no alerta).
1. No projeto da **API** na Vercel, crie a variável `MODERATOR_EMAILS` = `demo@vaidebike.app` (Production; vários e-mails separados por vírgula) e faça o Redeploy.
2. Entre com a conta demo (`senha123`) e **troque a senha** em Perfil → Conta e segurança. Enquanto a senha padrão não for trocada, a conta NÃO é moderadora (trava de segurança).
3. Abra `/alertas` (link "Caixa de alertas" no menu): aprove, ajuste ou recuse (com motivo).
Só liste e-mails de contas que já existem. Antes de lançar: apague `SEED_TOKEN`/`HEALTH_DEBUG` e as contas demo.
Testes de moderação: defina `MODERATOR_TEST_EMAIL` e `MODERATOR_TEST_PASSWORD` para rodar os casos de aprovação.

## 8. Recuperar senha por e-mail
Na tela de login, "Esqueci minha senha" envia um link (vale 1 hora, uso único) para o e-mail da conta. Ao trocar a senha, todos os aparelhos saem da conta.
Para o e-mail funcionar, no projeto da **API** na Vercel (Production) crie:
- `APP_URL` = endereço do SITE, ex.: `https://seu-site.vercel.app` (sem `/` no final)
- **Opção A, Gmail:** ative a verificação em 2 etapas na conta Google, crie uma "senha de app" (myaccount.google.com/apppasswords) e defina `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=seuemail@gmail.com`, `SMTP_PASSWORD=<senha de app de 16 letras>`, `MAIL_FROM=VaiDeBike <seuemail@gmail.com>`
- **Opção B, Resend:** `RESEND_API_KEY` e `MAIL_FROM` (para enviar a qualquer pessoa, é preciso verificar um domínio seu no Resend)
Depois faça o Redeploy. Sem essas variáveis o pedido "funciona" na tela, mas nenhum e-mail sai.

## 9. Configurações e seguir ciclistas
- **Configurações** (engrenagem no Perfil, ou menu do avatar → Configurações): nome de usuário, e-mail (pede a senha), senha, tutorial, desativar (temporário: entrar de novo reativa) e excluir a conta.
- **Ciclistas** (`/ciclistas`): buscar por nome, seguir/deixar de seguir, ver seguidores e seguindo; perfil público em `/ciclistas/<id>` (nunca mostra e-mail). Contas demo e desativadas não aparecem.
- Não há variável nova: nada a configurar na Vercel.

## 10. Viagem em bolha e segundo plano
- Durante a navegação, a caixa de baixo virou uma **bolha flutuante**: tempo e km que faltam, hora de chegada, alertas no caminho e **Encerrar** (pede um segundo toque para confirmar). Toque na bolha para ver as próximas curvas; o botão de minimizar a transforma numa bolinha redonda com os minutos.
- **A tela não apaga** enquanto você pedala (Wake Lock). Funciona no Chrome/Android e no Safari/iOS 16.4+ (no app instalado).
- **Trocar de app:** o GPS de um site/PWA pode pausar quando o app vai para segundo plano (mais comum no iPhone). Ao voltar, o app pede a posição na hora e continua. Se o sistema fechar o app, ao reabrir o mapa aparece "Retomar a viagem?" (vale por 3 horas).
- **Limite da web:** com a tela bloqueada ou outro app aberto, o site não consegue tocar sons nem vibrar para avisar de perigos. Para isso funcionar de verdade é preciso a versão nativa (Capacitor, ver seção 4) com um plugin de localização em segundo plano. Sem isso, mantenha o app aberto na tela durante o pedal.

## 11. Borracharias e oficinas no mapa
- No mapa aparecem ícones redondos: **roxo = borracharia** (pneu), **azul = oficina de bike** (chave), **verde = ponto de autorreparo**. Tocar no ícone abre a bolha com endereço, horário, telefone (botão **Ligar**), **Rota até aqui**, nota média e avaliações. Quem está logado dá de 1 a 5 estrelas e comenta (uma avaliação por pessoa; avaliar de novo substitui). Em "Camadas de alerta" dá para ocultar esses ícones.
- **Encher o mapa com locais reais (uma vez):** com a variável `SEED_TOKEN` criada na API (como na seção 5), abra `https://SEU-API/api/admin/import-shops?token=SEU_TOKEN`. Ele busca no OpenStreetMap as oficinas, lojas de pneu e pontos de autorreparo de Fortaleza e responde `{"ok":true,"encontrados":…,"novos":…}`. Pode repetir quando quiser (não apaga avaliações). Se vier `overpass_indisponivel`, tente de novo em alguns minutos. Depois apague o `SEED_TOKEN`.
- O OpenStreetMap nem sempre tem telefone e horário. Quem souber completa: toque num ponto vazio do mapa → "Há uma borracharia/oficina aqui? Adicionar". A sugestão vai para **Caixa de alertas → aba Locais**, e o que a equipe aprova aparece para todos. A conta dev publica direto.
- Os dados importados exigem crédito "© colaboradores do OpenStreetMap" (já aparece na bolha e no rodapé do mapa).

**Remover um local do mapa:** abra o ícone no mapa → no fim da bolha, "Remover este local do mapa" (pede confirmação e apaga também as avaliações). Só aparece para quem adicionou o local e para a conta dev.

**Remover um alerta do mapa (conta dev):** toque no alerta → no fim do cartão, "Remover alerta do mapa" (pede confirmação). Vale para qualquer alerta, inclusive os já aprovados e os "resolvidos". O XP que o ciclista já ganhou não é retirado. Usuários comuns só retiram os próprios alertas que ainda estão em análise ou recusados (pelo Perfil).

## 12. Ciclovias e ciclofaixas no mapa (traçado)
**Importar as reais do OpenStreetMap (uma vez):** com `SEED_TOKEN` criado na API (seção 5), abra `https://SEU-API/api/admin/import-lanes?token=SEU_TOKEN`. Ele traz as ciclovias e ciclofaixas já mapeadas em Fortaleza (as que ficam sobre as avenidas, seguindo as ruas) e responde, por exemplo, `{"ok":true,"encontrados":…,"usados":…,"novos":…}`. Pode demorar até ~1 minuto. Repetir só atualiza. Depois apague o `SEED_TOKEN`. Se vier `overpass_indisponivel`, tente de novo mais tarde. Obs.: o que o OpenStreetMap ainda não tem não aparece; use o desenho abaixo.

**Desenhar um trecho que falta (conta dev):** no mapa, botão de camadas → "Desenhar / apagar ciclovias". Toque na rua de ponta a ponta (a cada curva ou esquina), "Concluir", dê o nome e escolha ciclovia (separada da pista) ou ciclofaixa (pintada). O servidor cola o traço nas ruas. Na aba "Apagar", toque num traçado para removê-lo.

As ciclovias de exemplo do seed podem ficar duplicadas sobre as importadas; se quiser, apague as de exemplo no modo "Apagar".

## 13. Fotos nos alertas
- Ao reportar, o ciclista pode anexar **até 3 fotos** (câmera ou galeria). O navegador reduz cada uma para ~1280 px (~100–250 KB) e **apaga a localização escondida na foto (EXIF)**. A conta dev vê as fotos na Caixa de alertas antes de aprovar, e todos veem as miniaturas no cartão do alerta no mapa (toque para ampliar).
- As fotos ficam no próprio MongoDB (coleção `obstacle_photos`) e são apagadas junto com o alerta. Cada foto tem um endereço aleatório, impossível de adivinhar.
- **Vídeo ainda não:** a Vercel aceita no máximo ~4,5 MB por envio, e um vídeo de celular tem dezenas de MB. Para vídeo é preciso um armazenamento de arquivos (ex.: Vercel Blob ou Cloudinary). Se quiser, é o próximo passo.
- Atenção ao espaço: no plano grátis do Atlas (512 MB) cabem milhares de fotos, mas acompanhe o uso em Atlas → Metrics.
- **Câmera dentro do app:** o botão "Câmera" abre a câmera do celular na própria tela (com botão de tirar foto e de virar a câmera), sem sair do app. Precisa de HTTPS (o site da Vercel já tem) e da permissão do usuário. Se o navegador não suportar ou o usuário negar, o app abre a câmera nativa do celular; o botão "Galeria" continua disponível.

## 14. Notificações (sino)
- O sino fica no topo, ao lado do botão Reportar, com um contador de não lidas (atualiza a cada 30 s). Mostra: **novo seguidor**, **alerta ou local aprovado/recusado** e **avisos do app**.
- A conta de gestão envia avisos para todos em **Caixa de alertas → Enviar aviso do app**.
- Não precisa de configuração nova: as coleções `notifications` e `announcements` são criadas sozinhas. Notificações somem após 60 dias.
- **Mensagens diretas ainda não existem** (o chat é público). Quando houver, é só chamar `notify()` ao receber uma mensagem.

## 15. Mapa 3D (MapLibre + OpenFreeMap)
- O mapa principal agora é vetorial, gira e inclina durante a viagem, com prédios em 3D. Fonte: **OpenFreeMap** (gratuito, sem cadastro, sem chave; dados do OpenStreetMap). Nada a configurar na Vercel.
- Esta mudança adiciona uma biblioteca nova (`maplibre-gl`). A Vercel instala sozinha no deploy do site; só precisa de **Redeploy do frontend**.
- **Teste primeiro na prévia (Preview) da Vercel**, no celular, antes de dar Merge: mapa aparece escuro, ciclovias e alertas aparecem, o toque no mapa funciona e, ao iniciar uma viagem (ou "Simular"), o mapa inclina e gira com a seta.
- Se o estilo do OpenFreeMap sair do ar, o app troca sozinho para o mapa de imagens do OpenStreetMap (sem 3D).
- Crédito obrigatório: o rodapé do mapa mostra "OpenFreeMap / OpenMapTiles / OpenStreetMap contributors"; não remova.

## 16. Localização assim que abre o mapa
- Ao abrir o mapa, o navegador pede permissão de localização (uma vez). Permitindo, o ponto do ciclista aparece na hora e o mapa centraliza nele, sem precisar iniciar uma viagem. Negando, o mapa funciona normal e o botão do GPS continua disponível.
- Fora do pedal, a localização não registra km nem dispara avisos de perigo. Só o GPS ligado (pedal ou viagem) faz isso.
- Só frontend: basta o Redeploy do site.

## 17. Bicicletar e pontos de aluguel de bike
- O mapa tem uma nova camada, **"Bicicletar e aluguel de bike"** (painel de camadas, ícone de bicicleta âmbar), que pode ser ligada/desligada separada das borracharias.
- Os pontos vêm do OpenStreetMap (`amenity=bicycle_rental`) e usam o mesmo sistema de locais (`shops`), com o tipo novo `bicicletar`.
- **Passo obrigatório:** depois do Redeploy da API, abra uma vez `https://SEU-API/admin/import-shops?token=SEED_TOKEN`. É seguro repetir (não duplica).
- O OpenStreetMap pode ter **menos estações que as ~270 oficiais**. Quem estiver logado pode sugerir estações que faltam (passam pela moderação).
- Não existe disponibilidade de bikes em tempo real (não há API aberta confirmada). Backend mudou: precisa de Redeploy da API e do site.

## 18. Aviso ao entrar numa ciclovia/ciclofaixa
- Ao chegar a ~25 m de uma ciclovia ou ciclofaixa, aparece um aviso no topo: "Você está na ciclofaixa: Rua X. Ande com cuidado." (com uma vibração curta). Funciona com o GPS ligado, em viagem ou não.
- Avisa uma vez por trecho: só repete se o ciclista sair (mais de ~60 m) e voltar, e no máximo a cada 5 minutos por ciclovia.
- Só frontend: basta o Redeploy do site. O nome mostrado é o cadastrado da ciclovia.

## 19. Som de chegada ao destino
- Ao chegar no destino da viagem, toca um jingle curto (arpejo alegre, ~1 s), uma voz diz "Você chegou ao seu destino. Boa pedalada!" e o celular vibra. O botão de som do mapa silencia jingle e voz (a vibração continua).
- Os sons são gerados no próprio celular (Web Audio), sem arquivos de áudio nem biblioteca nova. Só frontend: Redeploy do site.
- **Mais sons (para testar e decidir quais ficam):**
  - *Fim do pedal registrado:* duas notas suaves descendo. Não toca logo depois do jingle de chegada.
  - *Conquista (subiu de nível, selo novo ou selo ao confirmar alerta):* escala rápida e brilhante, mais aguda.
  - *Voz da rota:* a ~100 m da próxima manobra, fala "Em 100 metros, vire à direita".
  - Todos obedecem ao botão de som do mapa. Para tirar algum que não ficar bom, é só remover a chamada correspondente (`playFinishSound`, `playRewardSound` em `useRide.ts`; o bloco "voz da rota" em `MapPage.tsx`).

## 20. Botões do mapa na versão web
- Os controles de zoom e bússola do mapa foram para o canto **superior direito** (só no computador), para não ficarem em cima dos botões do app (localizar, camadas, Reportar obstáculo). No celular eles ficam ocultos: o zoom é por pinça.

## 21. Busca geral (barra de baixo)
- A barra de baixo agora é a **lupa de pesquisa geral**: ao digitar (a partir de 3 letras, com meio segundo de espera) ela acha **ruas, avenidas e lugares de Fortaleza**; na hora também aparecem **borracharias/oficinas/Bicicletar, ciclovias e alertas** com aquele nome.
- Tocar num endereço traça a rota até lá. O botão de mira ao lado do endereço marca o ponto no mapa e abre o cartão **Ir até aqui / Reportar aqui / Adicionar local**. Tocar num local, ciclovia ou alerta abre o cartão dele ou centraliza o mapa.
- Não existe mais barra de busca no topo. Só frontend: Redeploy do site.

## 22. Relatar problema do app (botão do inseto)
- Botão com ícone de inseto no topo (ao lado do sino), visível para **todos**, até sem login. Abre um formulário: tipo (travou, deu erro, problema na tela, sugestão, outro) + descrição. O app anexa sozinho a página, o aparelho (user agent) e o tamanho da tela, para ajudar a reproduzir. É separado do botão **Reportar**, que continua só para o mapa.
- A equipe lê em **Caixa de alertas → aba Bugs**, com o contador de abertos, e marca **Analisando** ou **Resolvido**. Ao marcar Resolvido, quem estava logado recebe uma notificação de agradecimento no sino.
- Limite de 5 relatos por hora por pessoa (ou por IP, se não logada), contra spam. Nova coleção `bug_reports` (criada sozinha). Backend mudou: **Redeploy da API** e do site.
- Não tem anexo de print ainda; o testador pode mandar o print pelo grupo do beta.
