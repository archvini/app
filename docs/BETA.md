# Versão beta (APK para testadores)

Plano: gerar um APK, enviar a poucos testadores, testar por algumas semanas, corrigir e repetir. Nada de loja por enquanto.

## 1. Antes de enviar (equipe)
- [ ] Site e API no ar, tudo mesclado e com Redeploy feito (`docs/PUBLICAR.md`).
- [ ] Rodar `/admin/import-lanes` e `/admin/import-shops` uma vez; abrir o mapa e conferir.
- [ ] **Remover as contas de demonstração** e conferir `MODERATOR_EMAILS` (só a conta da equipe).
- [ ] Apagar `SEED_TOKEN` e `HEALTH_DEBUG` na Vercel depois dos imports.
- [ ] Escrever e publicar uma página de privacidade (localização, câmera, fotos, e-mail) e avisar os testadores.

## 2. Gerar o APK (equipe)
1. Abra pwabuilder.com e cole o endereço do site.
2. Escolha **Android** e gere o pacote (vem APK e AAB). Para o beta só o APK interessa.
3. Guarde o arquivo de assinatura (keystore) e a senha em dois lugares. Sem eles não dá para atualizar o app.
4. Coloque o `assetlinks.json` que o PWABuilder entrega em `frontend/public/.well-known/` e faça Redeploy do site (sem isso o app mostra uma barra de endereço).
5. Nomeie cada versão: `vaidebike-beta-0.1.apk`, `0.2`, ...

## 3. Enviar e instalar (testador)
1. A equipe manda o APK por Drive ou WhatsApp.
2. No Android: abrir o arquivo e permitir "instalar de fontes desconhecidas" quando pedir.
3. Abrir o app, criar conta e **permitir a localização** (e a câmera, ao reportar).
4. Para atualizar: instalar o APK novo por cima (os dados da conta ficam no servidor).

## 4. O que os testadores devem testar
- Cadastro, login e "esqueci a senha".
- Mapa abre já na minha localização; aviso ao entrar numa ciclovia/ciclofaixa.
- Reportar obstáculo com foto (câmera e galeria). Confirmar alerta.
- Buscar destino, iniciar navegação, ouvir a voz da rota, chegar (som de chegada).
- Camadas: borracharias e Bicicletar. Sugerir um local.
- Sino de notificações, seguir ciclistas, chat, missões, perfil.
- Celular com tela apagada durante a viagem (o GPS continua?).

## 5. Como reportar (modelo para o grupo)
```
Aparelho / Android:
O que eu fiz:
O que esperava:
O que aconteceu:
Print ou vídeo (se tiver):
```

## 6. Calendário sugerido
- Semana 1: 3 a 5 testadores próximos; foco em travamentos, mapa e GPS.
- Semana 2: correções + APK 0.2; foco em navegação, sons e fotos.
- Semana 3: ampliar o grupo (8 a 10); foco em desempenho em celulares simples.
- Semana 4: congelar mudanças, só correções; preparar a apresentação com os resultados do beta.

## 7. Cuidados
- Os testadores usam o banco de verdade: avise que os dados do beta podem ser apagados.
- Se ficar muito pesado em celular simples, oferecer um "mapa sem 3D".
- Anote cada bug e a correção: serve de material na apresentação.
