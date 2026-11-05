import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";

type Section = { title: string; body: ReactNode };

const Mail = () => (
  <a href={SUPPORT_MAILTO} className="font-semibold text-emerald-400 hover:underline">
    {SUPPORT_EMAIL}
  </a>
);

const PRIVACY: Section[] = [
  {
    title: "Quem somos",
    body: <>O VaiDeBike Fortaleza é um app de segurança para ciclistas. A equipe do projeto é a responsável pelos seus dados. Contato para qualquer assunto de privacidade: <Mail />.</>,
  },
  {
    title: "Quais dados coletamos",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Conta:</b> nome, e-mail, senha (guardada só de forma criptografada, nunca em texto), tipo de bike, bio e foto de perfil, se você enviar.</li>
        <li><b>Uso do app:</b> quilômetros pedalados, XP, nível, medalhas, quem você segue e quem segue você.</li>
        <li><b>Conteúdo que você publica:</b> alertas de perigo (com foto e local), avaliações de lojas, mensagens do chat e encontros.</li>
        <li><b>Localização:</b> só quando você permite no navegador/aparelho. A posição do GPS é usada no seu aparelho para guiar a rota e avisar de perigos. Não guardamos o seu trajeto: do pedal gravamos apenas a distância.</li>
        <li><b>Relatos de problema:</b> a mensagem que você escreve e dados técnicos que ajudam a reproduzir o erro (tipo de aparelho/navegador e a tela em que estava).</li>
        <li><b>Segurança:</b> seu endereço IP, por até 1 hora, para limitar tentativas de acesso abusivas.</li>
      </ul>
    ),
  },
  {
    title: "Para que usamos",
    body: <>Para criar e proteger sua conta, mostrar o mapa e os alertas, calcular rotas, dar XP e medalhas, moderar o conteúdo da comunidade, responder ao suporte e corrigir erros. Não vendemos seus dados e não usamos publicidade.</>,
  },
  {
    title: "Com quem os dados passam",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Vercel</b> (hospedagem do site e da API) e <b>MongoDB Atlas</b> (banco de dados).</li>
        <li><b>OpenStreetMap (OSRM e Nominatim)</b>: ao buscar um lugar ou traçar uma rota, o texto da busca e as coordenadas de origem e destino são enviados por nosso servidor, sem o seu nome ou e-mail.</li>
        <li><b>OpenFreeMap</b>: entrega as imagens do mapa ao seu navegador.</li>
        <li><b>Gmail</b>: envio de e-mails do app (como a recuperação de senha).</li>
      </ul>
    ),
  },
  {
    title: "O que outras pessoas veem",
    body: <>Seu nome, foto, bio, nível e medalhas aparecem no perfil público, e seu nome aparece nos alertas, avaliações, mensagens do chat e encontros que você publica. Não mostramos seu e-mail nem sua localização.</>,
  },
  {
    title: "Por quanto tempo guardamos",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Conta e histórico: até você excluir a conta.</li>
        <li>Sessão de login: 30 dias. Mensagens do chat: 7 dias. Notificações: 60 dias. Registro de IP para segurança: 1 hora.</li>
      </ul>
    ),
  },
  {
    title: "Seus direitos (LGPD)",
    body: (
      <>
        Você pode pedir acesso, correção, portabilidade e exclusão dos seus dados, e retirar consentimentos. Para editar seus dados e <b>excluir a conta</b> (apaga conta, sessões, histórico de pedais, mensagens, avaliações e alertas ainda não publicados), vá em <Link to="/configuracoes" className="font-semibold text-emerald-400 hover:underline">Configurações</Link>. Alertas já publicados continuam no mapa para proteger a comunidade. Para os demais pedidos, escreva para <Mail /> e respondemos em até 15 dias.
      </>
    ),
  },
  {
    title: "Segurança",
    body: <>Usamos conexão criptografada (HTTPS), senhas com criptografia forte, sessão por cookie protegido e limites de tentativa de acesso. Nenhum sistema é 100% seguro; se você achar uma falha, avise em <Mail /> antes de divulgar.</>,
  },
  {
    title: "Crianças e adolescentes",
    body: <>O app é para maiores de 13 anos. Menores de 18 devem usar com o conhecimento dos responsáveis. Ande sempre com atenção ao trânsito: não use o celular em movimento.</>,
  },
  {
    title: "Mudanças nesta política",
    body: <>Se algo importante mudar, avisamos no app. A data da última atualização fica no topo desta página.</>,
  },
];

const TERMS: Section[] = [
  {
    title: "Aceite",
    body: <>Ao criar uma conta ou usar o VaiDeBike Fortaleza você concorda com estes termos e com a <Link to="/privacidade" className="font-semibold text-emerald-400 hover:underline">Política de Privacidade</Link>.</>,
  },
  {
    title: "O que é o app",
    body: <>Um app comunitário que mostra ciclovias e ciclofaixas, calcula rotas de bike e reúne alertas de perigo feitos por ciclistas. É um projeto em fase de testes (beta) e pode mudar, ficar fora do ar ou ter erros.</>,
  },
  {
    title: "Segurança no trânsito",
    body: <>As rotas, avisos e alertas são <b>informativos</b> e podem estar errados, desatualizados ou incompletos. Você é responsável pela sua condução: respeite o Código de Trânsito, use capacete e luzes, preste atenção na via e nunca mexa no celular pedalando. O VaiDeBike não se responsabiliza por acidentes, danos ou multas decorrentes do uso do app.</>,
  },
  {
    title: "Sua conta",
    body: <>Informe dados verdadeiros, guarde sua senha e não compartilhe a conta. Avise se suspeitar de uso indevido. Você pode excluir a conta a qualquer momento em Configurações.</>,
  },
  {
    title: "Regras da comunidade",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Reporte apenas perigos reais, no lugar certo, e sem fotos que mostrem rostos ou placas de forma identificável.</li>
        <li>Nada de ofensas, assédio, spam, golpes, conteúdo ilegal ou que exponha dados de outras pessoas.</li>
        <li>Não tente burlar a segurança do app, acessar contas de terceiros ou sobrecarregar o serviço.</li>
      </ul>
    ),
  },
  {
    title: "Conteúdo que você publica",
    body: <>O conteúdo continua sendo seu, mas você nos autoriza a exibi-lo no app para a comunidade. Alertas passam por moderação e podem ser editados, recusados ou removidos. Contas que quebrarem as regras podem ser suspensas ou excluídas.</>,
  },
  {
    title: "Dados de terceiros",
    body: <>Mapas e rotas vêm de serviços abertos (OpenStreetMap e OpenFreeMap) e podem conter imprecisões. © colaboradores do OpenStreetMap.</>,
  },
  {
    title: "Mudanças e contato",
    body: <>Podemos atualizar estes termos; mudanças importantes serão avisadas no app. Dúvidas, problemas ou contato: <Mail />.</>,
  },
];

export default function LegalPage({ kind }: { kind: "privacidade" | "termos" }) {
  const isPrivacy = kind === "privacidade";
  const sections = isPrivacy ? PRIVACY : TERMS;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10" data-testid={`legal-${kind}`}>
      <h1 className="font-heading text-3xl font-black tracking-tight text-white">
        {isPrivacy ? "Política de Privacidade" : "Termos de Uso"}
      </h1>
      <p className="mt-1 text-xs text-slate-500">Última atualização: 5 de novembro de 2026</p>
      <div className="mt-6 space-y-6">
        {sections.map((s, i) => (
          <section key={s.title}>
            <h2 className="font-heading text-lg font-bold text-white">{i + 1}. {s.title}</h2>
            <div className="mt-1.5 text-sm leading-relaxed text-slate-300">{s.body}</div>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm">
        <Link to={isPrivacy ? "/termos" : "/privacidade"} className="font-semibold text-emerald-400 hover:underline">
          {isPrivacy ? "Ver os Termos de Uso" : "Ver a Política de Privacidade"}
        </Link>
      </p>
    </div>
  );
}
