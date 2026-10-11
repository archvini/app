# VaiDeBike Fortaleza — SPEC

App web (pt-BR) de segurança ciclista para Fortaleza-CE: mapa das ciclovias/ciclofaixas, alertas
comunitários de obstáculos (buracos, obras, trechos inacabados, falta de iluminação), modo GPS em
tempo real com alerta de proximidade, cadastro/login e gamificação (XP, níveis, missões, emblemas/selos).

## Stack
- Backend: FastAPI (uvicorn :8001, --reload) + motor/MongoDB (`app` db). Tudo sob `/api`.
  - `backend/server.py` monta: `auth_router`, `obstacles_router`, `bikelanes_router`, `gamification_router`, `rides_router` (todos em `backend/routers/`, prefixo `/api`).
  - Sessões: cookie httpOnly `vdb_session` (token uuid na coleção `sessions`). Senhas pbkdf2_sha256 (passlib).
  - `GET /api/auth/me` devolve **200 + null** para visitantes (sem 401).
  - Gamificação: `backend/lib/game.py` — XP (+50 report, +25 confirmar, +10/km), nível = xp//500+1,
    5 badges (condições em `_CONDITIONS`), 3 missões (métricas reports/km/confirms).
- Frontend: Vite + React 19 + TS strict + Tailwind v4 (tema escuro tático, fonte Outfit/Plus Jakarta/JetBrains Mono).
  - Páginas: `/` (Home+radar), `/map` (Leaflet OSM escurecido + HUD GPS + report + painel de detalhes),
    `/missions` (missões/selos/placar), `/profile` (stats+edição), `/login`, `/register`.
  - Dados: TanStack Query; obstáculos refetch a cada 10s (tempo real). `src/lib/session.ts` é o dono do cache
    (beginSession/endSession). Tipos espelhados em `src/lib/types.ts`.

## Endpoints
- POST `/api/auth/register|login|logout`, GET/PUT `/api/auth/me`
- GET `/api/bikelanes` (7 rotas seed de Fortaleza)
- GET `/api/obstacles?type=&status=&mine=` | POST `/api/obstacles` | POST `/api/obstacles/{id}/confirm` (proibido auto-confirmar → 400) | POST `/api/obstacles/{id}/resolve` (só dono)
- GET `/api/missions` (progresso do usuário logado), GET `/api/badges`, GET `/api/leaderboard`, GET `/api/stats`
- POST `/api/rides {km}` (+10 XP/km, dispara badges de km)
- GET `/api/route?from_lat&from_lng&to_lat&to_lng` → rota de bike por ruas (OSRM `routing.openstreetmap.de`, perfil bike): `coordinates[[lat,lng]]`, `distance_m`, `duration_s`, `steps[]` (manobras em pt-BR) e `source` (`bike` | `straight` = fallback em linha reta se o roteador estiver fora do ar)
- GET `/api/geocode?q=` → busca de endereços/lugares em Fortaleza (Nominatim, só no submit — nada de autocomplete por política de uso)
- GET `/api/status` (scaffold do template, sem uso no app)

## Dados (coleções)
- `users`: id(uuid str), name, email(unique), bio, bike_type, city, xp, level, total_km, reports_count, confirms_count, badge_ids[], created_at
- `sessions`: token(unique), user_id
- `obstacles`: id, user_id, user_name, type(buraco|obra|trecho_inacabado|falta_iluminacao|outros), severity(baixa|media|alta), description, lat, lng, status(ativo|resolvido), confirms, created_at
- `bikelanes`: id, name, kind(ciclovia|ciclofaixa), length_km, notes, coordinates[[lat,lng]], waypoints[[lat,lng]] (pontos digitados à mão no seed), snapped(bool)

## Ciclovias coladas nas ruas (snap)
- Causa dos "traços longos" no mapa: o seed tinha só 3–6 pontos por ciclovia, ligados em linha reta (cortavam quarteirões e o mar).
- `backend/lib/snap.py` pede ao roteador de bike a geometria real passando pelos `waypoints` e grava a polilinha densa em `coordinates` (`snapped=true`, `length_km` recalculado; alertas de exemplo `seed-<lane>-*` são reposicionados sobre a via).
- Roda no `seed.py` e em segundo plano no startup do servidor (`snap_pending_lanes`, melhor esforço — nunca derruba o boot). Exige saída para a internet; sem ela as ciclovias ficam `snapped=false`.
- No front, ciclovia `snapped=false` é desenhada fraca e pontilhada ("traçado aproximado") em vez de um traço grosso e falso.

## Navegação estilo Uber/99 (frontend)
- `hooks/useNavigation.ts`: destino → rota (`/api/route`) → fases `idle | preview | navigating | arrived`; progresso ao longo da rota, ETA, próxima manobra, recálculo ao sair >70 m da rota (intervalo mínimo 10 s), chegada <30 m, nº de obstáculos a ≤40 m da rota.
- `components/map/FortalezaMap.tsx`: câmera que segue o ciclista (rAF suave), seta de direção que gira com o rumo (`useRide.heading`), rota com contorno, pino de destino, marcadores de obstáculo atualizados incrementalmente (sem piscar no refetch de 10 s), obstáculos no caminho com anel laranja.
- Gestos: arrastar (solta a câmera → botão "recentralizar"), pinça/duplo toque (Leaflet), segurar ~0,55 s no mapa = escolher destino, painel inferior arrastável com inércia (`BottomSheet.tsx`), cartão de alerta fecha deslizando para baixo. No desktop o painel vira lateral esquerda.
- "Simular" percorre a rota virtualmente (`useRide.startRoute`) — para testar sem GPS.
- (Resolvido em "Mapa 3D" abaixo: o mapa principal migrou para MapLibre GL.)

## Seed (backend/seed.py — idempotente)
- 7 ciclovias/ciclofaixas (Beira-Mar, Washington Soares, Aguanambi, Domingos Olímpio, Santos Dumont, Godofredo Maciel, Parque do Cocó)
- 6 obstáculos de exemplo nos eixos acima (só inseridos se a coleção estiver vazia)
- 3 contas demo (ver `memory/test_credentials.md`), todas senha `senha123`
- Demo GPS do HUD simula pedalada (~18 km/h) na Ciclovia da Beira-Mar

## Decisões conhecidas (não são bugs)
- Tiles: OpenStreetMap escurecido via CSS `filter: invert(1) hue-rotate(190deg)` (CARTO dark exige API key hoje).
- Missão "Sentinela Noturna" (3 confirmações) premia o badge "Mestre do Asfalto" (que também exige 10 reports) — par já definido nas diretrizes de design.
- Km do pedal só é registrado no servidor quando o usuário ENCERRA o pedal (toggle off/fim da demo); unmount descarta.
- `response_model=User | None` no /auth/me é intencional (visitante = null, sem 401).
- Cadastro dá o emblema "Calouro do Pedal" imediatamente (por design).

## Deploy na Vercel (multi-service)
- `vercel.json` na raiz: serviço `backend` (FastAPI, `backend/server.py`) e `frontend` (Vite); `/api/*` → backend, o resto → frontend. Sem bindings (o front chama `/api` por caminho relativo).
- Variáveis obrigatórias: `MONGO_URL`, `DB_NAME` (MongoDB Atlas; liberar `0.0.0.0/0`). Opcional: `CORS_ORIGINS`.
- Em serverless as tarefas de startup (índices/snap) não são confiáveis: rodar `python seed.py` uma vez com `MONGO_URL` do Atlas.
- `backend/requirements.txt` só tem dependências de runtime (para caber no limite da função); testes/lint em `requirements-dev.txt`.

## Radar de perigos em tempo real (mapa)
- Marcadores em forma de placa de advertência (`.hz*` em `index.css`, desenho em `lib/hazards.ts`): cor/ícone por tipo, anel pulsante por gravidade, aro laranja se estiver na rota, animação de queda para alertas novos (lista atualiza a cada 6 s), placas menores com zoom < 14.
- `lib/proximity.ts` (puro, testável): níveis observar ≤500 m / atenção ≤250 m / perigo ≤100 m, só conta o que está à frente (cone ±80° do rumo), histerese de 40 m, avisa uma vez por nível.
- `hooks/useHazardWatch.ts`: som (2 tons = atenção, 3 tons agudos = perigo), voz pt-BR e vibração; `levels` faz a placa crescer/pulsar no mapa; `primary` alimenta o `HazardAlertCard` (distância, ETA, ciclovia, gravidade, dispensar por 3 min) e a linha tracejada até o perigo.
- UI: `MapHud` (status do radar/velocidade/som; substitui o antigo LiveGPSTracker), `HazardAlertCard`, `HazardIcon`.

## Chat global e encontros
- `/chat` (login obrigatório): aba **Conversa** (mensagens com atualização a cada 4 s por polling — a Vercel não tem WebSocket; 500 caracteres; máx. 5 msgs/20 s; apaga só a própria; some após 7 dias via índice TTL) e aba **Encontros** (qualquer ciclista marca pedalada com nome, local, data/hora e detalhes; os outros confirmam "Eu vou"; máx. 5 encontros ativos por pessoa; some 30 dias depois da data).
- API: `GET/POST /api/chat/messages`, `DELETE /api/chat/messages/{id}`, `GET/POST /api/meetups`, `POST /api/meetups/{id}/join` (alterna), `DELETE /api/meetups/{id}`.
- Excluir a conta apaga mensagens e encontros da pessoa e a remove das listas de presença.
- Ainda não há moderação (denunciar/banir). Antes de abrir ao público, adicionar denúncia e um papel de moderador.

## Alertas moderados (caixa de alertas)
- Usuário comum: `POST /obstacles` → `status=pendente` (sem XP, máx. 10 pendentes, 429). Moderador (`MODERATOR_EMAILS`, seed exige `password_changed`) publica direto (`ativo`).
- Mapa público só lista `ativo`/`resolvido`; `pendente`/`recusado` público → 403. Autor vê os seus (`mine`) e pode retirar: `DELETE /obstacles/{id}`.
- `/api/moderation` (só moderador): `GET /summary`, `GET /queue?status=pendente|recusado` (dica de duplicata em 60 m), `POST /{id}/approve` (edição opcional; +XP ao autor uma única vez, atômico), `POST /{id}/reject` (motivo ≤200).
- Frontend: `/alertas` (AlertsInboxPage + MiniMap), badge na Navbar, `User.is_moderator`.

## Recuperação de senha
- `POST /auth/forgot {email}` (resposta idêntica exista a conta ou não; máx. 3 pedidos/h por conta) → grava só o hash SHA-256 do token em `password_resets` (TTL 1 h) e envia o link `APP_URL/redefinir-senha?token=…` via `lib/mailer.py` (SMTP ou Resend).
- `POST /auth/reset {token,new_password}` → uso único e atômico; troca a senha, encerra todas as sessões.
- Frontend: `/esqueci-senha`, `/redefinir-senha`, link no Login. O host do link vem de `APP_URL`/`CORS_ORIGINS`, nunca do pedido.

## Configurações e rede social
- Auth: `POST /auth/email {new_email,password}`, `POST /auth/deactivate {password}` (`deactivated:true`, apaga sessões; `login` reativa; some de busca/placar), delete-account também apaga `follows`.
- `routers/social.py` (`/social`, exige login; sem e-mail na resposta; ignora `seed-*` e desativados): `GET /people?q=`, `GET /people/{id}`, `GET /people/{id}/followers|following`, `POST|DELETE /people/{id}/follow` (idempotente). Coleção `follows` (par único follower→followee).
- Frontend: `/configuracoes[/:secao]` (conta, senha, ajuda, zona-de-risco; lista no celular, menu lateral no desktop), `/ciclistas`, `/ciclistas/:id`; engrenagem no Perfil.

## Bolha de viagem e segundo plano
- Fase `navigating`: `NavBubble` (pílula flutuante, anel de progresso, minimizável em bolinha, lista de curvas ao tocar, Encerrar com confirmação) substitui o BottomSheet; informa a altura via `onInsetChange` para os botões do mapa.
- `useWakeLock` mantém a tela ligada; `useRide` repede a posição ao voltar do segundo plano; `useNavigation` guarda `vdb_trip` (destino, 3 h) e o mapa oferece "Retomar a viagem?". Avisos sonoros/vibração em segundo plano exigem app nativo (Capacitor).

## Borracharias, oficinas e avaliações
- Coleções `shops` (kind borracharia|oficina|autoreparo, status pendente|ativo, source osm|comunidade, rating_avg/count) e `shop_reviews` (par único shop+user). `routers/shops.py`: `GET /shops` (ativos), `POST /shops` (sugestão → pendente; moderador publica direto; máx. 5 pendentes; 409 duplicata ≤40 m com mesmo nome), `GET /shops/{id}` (com avaliações, exige login), `PUT|DELETE /shops/{id}/review`, moderação `GET /shops/moderation/queue`, `POST /shops/{id}/approve|reject`.
- `GET /admin/import-shops?token=` (SEED_TOKEN): Overpass → upsert por `osm_id`; nenhum dado inventado no seed.
- Frontend: `lib/shops.ts`, marcadores em `FortalezaMap` (props `shops`/`onSelectShop`), `ShopCard`, `SuggestShopModal`, aba "Locais" na caixa de alertas, toggle em Camadas.

## Traçado de ciclovias (OSM + desenho)
- `BikeLane.source` seed|osm|comunidade. `GET /admin/import-lanes?token=` (Overpass, `out geom`, Douglas-Peucker 2,5 m, mín. 60 m, máx. 2500 trechos/60 mil pontos, nomeados primeiro; id `osm-way-<id>`). `GET /bikelanes` até 3000 (GZip no servidor).
- Conta dev: `POST /bikelanes {name,kind,waypoints[2..60]}` (snap às ruas via roteador; 503 se indisponível; linha aproximada se resultado estranho) e `DELETE /bikelanes/{id}`.
- Frontend: `LaneEditor` (modos desenhar/apagar), `FortalezaMap` props `drawPoints`/`onSelectLane`; lista de ciclovias do painel mostra só as não-OSM (15).

## Fotos nos alertas
- `ObstacleCreate.photos` (≤3 data URLs jpeg/png/webp ≤450 mil chars, validadas por assinatura) → coleção `obstacle_photos` (bytes, id aleatório de 32 hex); `Obstacle.photo_ids`; `GET /obstacles/photos/{id}` (público por id secreto, cache 1 dia). Apagadas ao retirar/remover o alerta e ao excluir a conta (pendentes).
- Frontend: `fileToPhotoDataUrl` (canvas, JPEG, tira EXIF), seletor no `ReportObstacleModal`, `PhotoStrip` no cartão do mapa e na caixa de alertas. Vídeo exige storage externo (limite de 4,5 MB da Vercel).
- Câmera no app: `CameraCapture` (portal z-[3500], `getUserMedia`, botão virar câmera, desenha o frame em canvas → `canvasToPhotoDataUrl`). Sem suporte/permissão → `onUnavailable` aciona `<input capture="environment">`; botão "Galeria" separado.

## Notificações
- `notifications` (por usuário, TTL 60 d; kinds follow/alert_ok/alert_no/shop_ok/shop_no) e `announcements` (avisos para todos; lidos via `users.notif_seen_at`). `lib/notify.notify()` é best-effort e ignora contas `seed-`.
- Rotas: `GET /notifications`, `/unread-count`, `POST /read-all`, `/{id}/read`, `DELETE /notifications`, `POST|DELETE /announcements` (gestor). Gatilhos: follow novo, approve/reject de alerta e de local.
- Frontend: `NotificationBell` (Popover, z 2600) na Navbar; `AnnouncementForm` na caixa de alertas. Sem DMs.

## Mapa 3D (MapLibre GL + OpenFreeMap)
- `FortalezaMap` agora usa **MapLibre GL 4.7.1** (mesmas props de antes) com o estilo vetorial `https://tiles.openfreemap.org/styles/positron` (OpenFreeMap: dados do OpenStreetMap, sem chave de API, atualizado toda semana). `darken()` pinta o estilo claro de escuro por código e troca os prédios planos por `fill-extrusion` (prédios 3D, altura `render_height`). Se o estilo não carregar, cai para tiles de imagem do OSM (`RASTER_FALLBACK`).
- Camadas de desenho (GeoJSON): `lanes` (3 camadas: sólida, ciclofaixa tracejada, aproximada), `route`, `guide`, `draw`/`drawpts`, `radar` (círculo em metros como polígono). Marcadores continuam HTML (`htmlMarker`): perigos, locais, destino, pino de toque e o ciclista.
- Navegando: câmera `easeTo` inclinada (`NAV_PITCH = 60`), girando com o rumo, ciclista um pouco abaixo do centro; a seta é um marcador com `pitchAlignment/rotationAlignment: "map"` (deitada sobre a rua). Fora da navegação: norte para cima e plano. Ao encerrar a viagem o mapa volta plano. Computador: botões +/−/bússola (`NavigationControl`); celular: dois dedos giram/inclinam.
- `MiniMap` (caixa de alertas) continua em Leaflet com tiles raster do OSM (uso baixo, só gestão).
- Não testado em tela real quando foi escrito (sem instalar dependências no ambiente de desenvolvimento).

## Localização ao vivo no mapa
- `useRide` mantém um `watchPosition` passivo quando não há pedal (`here`/`hereHeading`): `state.pos` e `state.heading` valem para o pedal enquanto `riding` e para a localização atual do aparelho quando parado. Não conta km nem dispara radar (o `useHazardWatch` só avalia com `riding`). Pausa com o app em segundo plano e não insiste se o usuário negar a permissão.
- `MapPage` centraliza uma única vez (zoom 16) na primeira posição, a menos que haja `?lat=` (link da caixa de alertas), pedal em andamento ou o usuário já tenha arrastado o mapa. O botão "Recentralizar" aparece sempre que há posição e a câmera está solta.

## Bicicletar / aluguel de bike
- Reusa `shops` com `kind="bicicletar"`. `/admin/import-shops` também consulta `amenity=bicycle_rental` (Overpass, timeout 60, limite 900); `_shop_from_osm` nomeia "Estação Bicicletar" quando nome/rede/operadora citam bicicletar ou serttel, senão "Aluguel de bicicletas".
- `MapPage` filtra com `visibleShops` (useMemo): `bicicletar` segue o toggle `showBikeShare`, os demais seguem `showShops`.
- Sem disponibilidade em tempo real. Teste: `backend/tests/test_shop_osm_mapping.py`.

## Aviso de ciclovia/ciclofaixa
- `hooks/useLaneNotice(pos, lanes)` (chamado no `MapPage`): acha a faixa mais próxima a cada posição; entra a ≤25 m, sai a >60 m (histerese), cooldown 5 min por faixa; dispara `toast.info` + `navigator.vibrate`. Sem som/voz (diferente do radar de perigos).

## Som de chegada
- `playArrivalSound()` em `hooks/useRide.ts` (osciladores triangle, dó-mi-sol-dó). `MapPage` dispara quando `phase` vira `arrived`: vibração + (se `soundOn`) jingle e voz pt-BR. Deps só `[phase]` para não repetir ao mexer no botão de som.
