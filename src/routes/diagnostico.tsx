import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Hexagon, ArrowRight, ArrowLeft, Layers, Users, MessageSquare, Lock,
  ThumbsUp, Sparkles, Check, RotateCcw, TrendingUp, AlertTriangle, Clock, Target, BarChart3,
} from "lucide-react";
import { Sidebar, TopBar, MobileTopBar, MobileTabBar } from "./index";

export const Route = createFileRoute("/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico de Maturidade — LURE Growth" },
      { name: "description", content: "Avalie as principais áreas da sua empresa e receba um plano de ação personalizado gerado com IA." },
      { property: "og:title", content: "Diagnóstico de Maturidade Empresarial 360° — LURE" },
      { property: "og:description", content: "42 perguntas, 6 pilares, um raio-x completo do seu negócio." },
    ],
  }),
  component: DiagnosticoPage,
});

// ————————————————————————————————————————————————————————
// Data
// ————————————————————————————————————————————————————————
type Option = { score: 1 | 2 | 3 | 4 | 5; label: string; text: string };
type Question = { id: string; text: string; options: Option[] };
type Category = { id: string; name: string; icon: typeof Layers; questions: Question[] };

const opt = (score: 1 | 2 | 3 | 4 | 5, label: string, text: string): Option => ({ score, label, text });

const CATEGORIES: Category[] = [
  {
    id: "gestao",
    name: "Gestão e Estratégia",
    icon: Layers,
    questions: [
      { id: "1.1", text: "Qual é o nível de clareza e formalização da visão e da estratégia de longo prazo da empresa?", options: [
        opt(1, "Inexistente", "Não há metas de longo prazo definidas."),
        opt(2, "Básico", "Metas informais, sem documentação clara."),
        opt(3, "Intermediário", "Planejamento estratégico anual documentado, mas pouco revisado."),
        opt(4, "Avançado", "Planejamento estratégico claro, desdobrado em OKRs/metas mensais."),
        opt(5, "Líder", "Visão inspiradora desdobrada para todos os níveis, integrada ao dia a dia."),
      ]},
      { id: "1.2", text: "Como é realizada a definição e o acompanhamento das metas individuais e de times?", options: [
        opt(1, "Inexistente", "Não há metas claras individuais ou de times."),
        opt(2, "Básico", "Há metas verbais sem rotina de acompanhamento estruturada."),
        opt(3, "Intermediário", "Metas definidas anualmente ou semestralmente, com análises ocasionais."),
        opt(4, "Avançado", "OKRs ou metas trimestrais revisadas com rituais mensais ou semanais."),
        opt(5, "Líder", "Sistema de metas conectado ao painel de KPIs atualizado em tempo real."),
      ]},
      { id: "1.3", text: "Quão estruturada é a definição de processos e fluxos operacionais?", options: [
        opt(1, "Improvisado", "Sem documentação, processos variam a cada execução."),
        opt(2, "Básico", "Alguns processos críticos estão registrados no papel ou chats."),
        opt(3, "Intermediário", "Manuais de processos existem, mas estão desatualizados."),
        opt(4, "Avançado", "Processos mapeados, documentados (Playbooks) e seguidos pela equipe."),
        opt(5, "Líder", "Processos padronizados e continuamente otimizados com dados e automações."),
      ]},
      { id: "1.4", text: "Como você avalia o controle e a previsibilidade financeira da empresa?", options: [
        opt(1, "Improvisado", "Sem visibilidade clara de caixa ou faturamento previsível."),
        opt(2, "Básico", "Apenas fluxo de caixa básico do mês corrente."),
        opt(3, "Intermediário", "DRE mensal atualizado, mas sem projeções de longo prazo."),
        opt(4, "Avançado", "Previsão orçamentária anual e controle rígido de margem."),
        opt(5, "Líder", "Dashboard financeiro em tempo real conectado a cenários e projeções."),
      ]},
      { id: "1.5", text: "Como são tomadas as decisões estratégicas dentro do negócio?", options: [
        opt(1, "Empírico", "Decisões baseadas exclusivamente no feeling dos sócios."),
        opt(2, "Básico", "Focadas em histórico simples e dados superficiais de faturamento."),
        opt(3, "Intermediário", "Baseadas em relatórios mensais gerados com atraso."),
        opt(4, "Avançado", "Análise sistemática de dados de mercado e KPIs internos."),
        opt(5, "Líder", "Decisões orientadas por dados em tempo real e experimentos."),
      ]},
      { id: "1.6", text: "Qual é o nível de autonomia da empresa sem a presença direta dos fundadores?", options: [
        opt(1, "Dependência total", "A empresa para de operar se os fundadores se ausentarem por dias."),
        opt(2, "Dependência alta", "Equipe executa tarefas básicas, mas decisões travam."),
        opt(3, "Intermediário", "Operação roda, mas problemas médios exigem presença direta."),
        opt(4, "Avançado", "Empresa roda estável por semanas sem intervenção dos sócios."),
        opt(5, "Líder", "Totalmente autônoma, com governança e gestão profissionalizada."),
      ]},
      { id: "1.7", text: "Como a empresa monitora e responde à concorrência e mudanças de mercado?", options: [
        opt(1, "Reativo", "Só respondemos quando perdemos clientes significativos."),
        opt(2, "Básico", "Monitoramos esporadicamente o posicionamento dos rivais."),
        opt(3, "Intermediário", "Análise anual das tendências e posicionamento competitivo."),
        opt(4, "Avançado", "Rotina mensal de análise competitiva e adaptação."),
        opt(5, "Líder", "Antecipamos tendências, testando soluções à frente do setor."),
      ]},
    ],
  },
  {
    id: "cultura",
    name: "Cultura e Liderança",
    icon: Users,
    questions: [
      { id: "2.1", text: "Como está definida a estrutura organizacional e responsabilidades das funções?", options: [
        opt(1, "Confusa", "Todos fazem um pouco de tudo sem clareza de papéis."),
        opt(2, "Básico", "Divisão informal com frequente sobreposição."),
        opt(3, "Intermediário", "Organograma básico, responsabilidades não documentadas."),
        opt(4, "Avançado", "Organograma claro com descritivo de funções e metas."),
        opt(5, "Líder", "Estrutura fluida com papéis desenhados e caminhos de carreira."),
      ]},
      { id: "2.2", text: "Como são definidos e vivenciados os valores e a cultura da empresa?", options: [
        opt(1, "Inexistente", "Sem valores formalizados, foco no dia a dia técnico."),
        opt(2, "Básico", "Valores no site ou parede, sem vivência real."),
        opt(3, "Intermediário", "Liderança busca seguir os valores informalmente."),
        opt(4, "Avançado", "Valores guiam contratações, demissões e avaliações."),
        opt(5, "Líder", "Cultura forte funciona como diferencial competitivo."),
      ]},
      { id: "2.3", text: "Qual é a qualidade e a frequência das rotinas de feedback?", options: [
        opt(1, "Nulo", "Feedback só ocorre em demissão ou problemas graves."),
        opt(2, "Básico", "Feedbacks rápidos de corredor, sem registro."),
        opt(3, "Intermediário", "Avaliações anuais com feedbacks pontuais."),
        opt(4, "Avançado", "Rituais mensais de 1-on-1 com planos de ação."),
        opt(5, "Líder", "Feedback contínuo integrado ao desenvolvimento acelerado."),
      ]},
      { id: "2.4", text: "Como é o processo de atração e recrutamento de novos talentos?", options: [
        opt(1, "Improvisado", "Contratações rápidas por indicação ou urgência."),
        opt(2, "Básico", "Triagem simples e entrevista técnica com os sócios."),
        opt(3, "Intermediário", "Processo estruturado por perfil técnico, sem fit cultural."),
        opt(4, "Avançado", "Teste técnico, fit cultural e múltiplos avaliadores."),
        opt(5, "Líder", "Employer Branding forte e funil de alta conversão."),
      ]},
      { id: "2.5", text: "Como é estruturada a integração (Onboarding) de novos colaboradores?", options: [
        opt(1, "Ausente", "O novo funcionário senta e começa a trabalhar."),
        opt(2, "Básico", "Apresentação rápida da equipe e acessos iniciais."),
        opt(3, "Intermediário", "Agenda de conversas e leitura de playbooks na 1ª semana."),
        opt(4, "Avançado", "Programa de 30 dias com metas, mentor e testes."),
        opt(5, "Líder", "Experiência marcante focada em cultura, técnica e produtividade."),
      ]},
      { id: "2.6", text: "Qual é o foco da liderança no desenvolvimento de novos líderes?", options: [
        opt(1, "Inexistente", "Os fundadores centralizam todas as lideranças."),
        opt(2, "Básico", "Promoção por tempo de casa, sem treinamento específico."),
        opt(3, "Intermediário", "Capacitações pontuais ou cursos externos."),
        opt(4, "Avançado", "Plano de desenvolvimento individualizado para gestores."),
        opt(5, "Líder", "Pipeline de liderança com plano de sucessão estruturado."),
      ]},
      { id: "2.7", text: "Como é monitorado o clima organizacional e a satisfação do time?", options: [
        opt(1, "Sem monitoramento", "Só sabemos quando alguém pede demissão."),
        opt(2, "Básico", "Conversas informais ocasionais."),
        opt(3, "Intermediário", "Pesquisa anual de clima simples."),
        opt(4, "Avançado", "e-NPS trimestral com planos de ação."),
        opt(5, "Líder", "Pulso quinzenal com planos ágeis de retenção."),
      ]},
    ],
  },
  {
    id: "marketing",
    name: "Marketing e Demanda",
    icon: MessageSquare,
    questions: [
      { id: "3.1", text: "Qual é o nível de conhecimento sobre o Perfil de Cliente Ideal (ICP)?", options: [
        opt(1, "Superficial", "Atendemos qualquer perfil disposto a pagar."),
        opt(2, "Básico", "Sabemos informações demográficas genéricas."),
        opt(3, "Intermediário", "Personas mapeadas, mas não guiam o marketing."),
        opt(4, "Avançado", "ICP documentado com dores, comportamentos e histórico."),
        opt(5, "Líder", "ICP hiper-segmentado integrado à qualificação de leads."),
      ]},
      { id: "3.2", text: "Como é estruturada a aquisição por canais pagos (Tráfego Pago)?", options: [
        opt(1, "Inexistente", "Sem campanhas ou impulsionamentos aleatórios."),
        opt(2, "Básico", "Campanhas no ar sem otimização constante."),
        opt(3, "Intermediário", "ROI positivo, mas dificuldade de escalar."),
        opt(4, "Avançado", "Estratégia multicanal com metas de CAC e LTV."),
        opt(5, "Líder", "Gestão científica de tráfego com automação e remarketing."),
      ]},
      { id: "3.3", text: "Como é gerido o funil de Inbound Marketing e produção de conteúdo?", options: [
        opt(1, "Sem funil", "Publicações esporádicas sem estratégia comercial."),
        opt(2, "Básico", "Redes ativas com conteúdo de topo genérico."),
        opt(3, "Intermediário", "Foco em conversão básica (iscas, e-books)."),
        opt(4, "Avançado", "Jornada completa automatizada no RD Station ou similar."),
        opt(5, "Líder", "Máquina de autoridade gerando leads previsivelmente."),
      ]},
      { id: "3.4", text: "Como a empresa monitora a taxa de conversão em cada etapa do funil?", options: [
        opt(1, "Não monitora", "Só sabemos o faturamento final do mês."),
        opt(2, "Básico", "Monitoramos cliques e volume de mensagens."),
        opt(3, "Intermediário", "Visitante → lead mapeada com ferramentas simples."),
        opt(4, "Avançado", "Taxas detalhadas por etapa (MQL, SQL, Oportunidade)."),
        opt(5, "Líder", "Funil integrado com atribuição avançada em tempo real."),
      ]},
      { id: "3.5", text: "Como está estruturada a sua proposta de valor única?", options: [
        opt(1, "Indiferenciada", "Mesmo produto/preço dos concorrentes."),
        opt(2, "Básico", "Argumentos de 'qualidade' e 'atendimento'."),
        opt(3, "Intermediário", "Diferenciais claros, difícil transmitir."),
        opt(4, "Avançado", "Proposta clara em toda a comunicação e pitch."),
        opt(5, "Líder", "Categoria própria, permitindo cobrar premium."),
      ]},
      { id: "3.6", text: "Quão estruturadas são as estratégias de Outbound (prospecção ativa)?", options: [
        opt(1, "Ausente", "Não realizamos prospecção ativa."),
        opt(2, "Básico", "Vendedores buscam contatos ocasionalmente."),
        opt(3, "Intermediário", "Lista fria com envios de e-mails em lote."),
        opt(4, "Avançado", "SDRs com listas qualificadas e cadência estruturada."),
        opt(5, "Líder", "Prospecção de precisão automatizada e integrada ao CRM."),
      ]},
      { id: "3.7", text: "Como a marca é percebida e posicionada (Branding)?", options: [
        opt(1, "Sem marca", "Somos vistos como uma commodity."),
        opt(2, "Básico", "Marca visual simples, sem atratividade extra."),
        opt(3, "Intermediário", "Reconhecida localmente com boa reputação."),
        opt(4, "Avançado", "Identidade forte, geradora orgânica de atração."),
        opt(5, "Líder", "Lovebrand com comunidade engajada e advogacia."),
      ]},
    ],
  },
  {
    id: "vendas",
    name: "Vendas e Conversão",
    icon: Lock,
    questions: [
      { id: "4.1", text: "Qual é o nível de adoção e a qualidade do uso do CRM de Vendas?", options: [
        opt(1, "Nenhum", "Controle no WhatsApp, caderno ou planilhas."),
        opt(2, "Básico", "Usamos CRM, mas a equipe não atualiza."),
        opt(3, "Intermediário", "CRM atualizado com pipeline básico."),
        opt(4, "Avançado", "CRM integrado ao marketing com automações."),
        opt(5, "Líder", "CRM inteligente com IA prevendo fechamentos."),
      ]},
      { id: "4.2", text: "Como você avalia os scripts e Playbooks comerciais?", options: [
        opt(1, "Inexistente", "Cada vendedor faz do seu jeito."),
        opt(2, "Básico", "Script geral sem mapeamento de objeções."),
        opt(3, "Intermediário", "Documento básico com processos."),
        opt(4, "Avançado", "Playbook completo com objeções e scripts gravados."),
        opt(5, "Líder", "Playbook dinâmico atualizado com práticas do time."),
      ]},
      { id: "4.3", text: "Como é realizado o treinamento do time de vendas?", options: [
        opt(1, "Nulo", "Aprendem no improviso assistindo aos outros."),
        opt(2, "Básico", "Explicação teórica no primeiro dia."),
        opt(3, "Intermediário", "Treinamentos pontuais mensais."),
        opt(4, "Avançado", "Rotina semanal de roleplay e escuta de ligações."),
        opt(5, "Líder", "Escola interna com certificação técnica."),
      ]},
      { id: "4.4", text: "Como funciona a comissão e incentivos para vendas?", options: [
        opt(1, "Fixo", "Só salário fixo, sem incentivo."),
        opt(2, "Básico", "Comissão simples sobre vendas individuais."),
        opt(3, "Intermediário", "Metas claras com faixas simples de comissão."),
        opt(4, "Avançado", "Metas aceleradoras (bônus) e coletivas."),
        opt(5, "Líder", "Incentivos ligados a LTV, margem e NPS."),
      ]},
      { id: "4.5", text: "Como é feita a qualificação de leads antes do contato de vendas?", options: [
        opt(1, "Sem qualificação", "Contatamos todos que chegam."),
        opt(2, "Básico", "Filtro manual com poucas perguntas."),
        opt(3, "Intermediário", "Formulário básico de conversão."),
        opt(4, "Avançado", "Pré-vendedores dedicados (LDR/SDR)."),
        opt(5, "Líder", "Automatizada com Lead Scoring."),
      ]},
      { id: "4.6", text: "Qual é a previsibilidade do ciclo médio de fechamento?", options: [
        opt(1, "Indeterminado", "Não sabemos quanto tempo o lead demora."),
        opt(2, "Básico", "Estimativa genérica do tempo de decisão."),
        opt(3, "Intermediário", "Ciclo médio monitorado retroativamente."),
        opt(4, "Avançado", "Mapeado por perfil com alertas de atraso."),
        opt(5, "Líder", "Previsibilidade estatística acurada do pipeline."),
      ]},
      { id: "4.7", text: "Como é a gestão de propostas de alto valor (Enterprise/High Ticket)?", options: [
        opt(1, "Amadora", "Propostas em texto no WhatsApp ou e-mail."),
        opt(2, "Básico", "PDF padronizado alterado manualmente."),
        opt(3, "Intermediário", "Slides estruturados com tabelas de preço."),
        opt(4, "Avançado", "Propostas customizadas com diagnóstico prévio."),
        opt(5, "Líder", "Proposta digital com assinatura instantânea e ROI."),
      ]},
    ],
  },
  {
    id: "experiencia",
    name: "Experiência e Clientes",
    icon: ThumbsUp,
    questions: [
      { id: "5.1", text: "Como é o onboarding do cliente após o fechamento?", options: [
        opt(1, "Desorganizada", "Cliente é entregue sem alinhamento prévio."),
        opt(2, "Básico", "E-mail padrão de boas-vindas."),
        opt(3, "Intermediário", "Kick-off só para grandes contas."),
        opt(4, "Avançado", "Roteiro com metas de ativação de 30 dias."),
        opt(5, "Líder", "Jornada automatizada focada em 1º Valor Percebido."),
      ]},
      { id: "5.2", text: "Constância e método para ouvir o cliente (NPS)?", options: [
        opt(1, "Inexistente", "Só falamos quando há reclamação."),
        opt(2, "Básico", "Conversas informais ocasionais."),
        opt(3, "Intermediário", "NPS anual sem processos definidos."),
        opt(4, "Avançado", "NPS contínuo com tratativa de detratores."),
        opt(5, "Líder", "Voz do Cliente retroalimenta produto e marketing."),
      ]},
      { id: "5.3", text: "Como é feita a prevenção ativa de churn?", options: [
        opt(1, "Reativo", "Cancelamentos processados quando solicitados."),
        opt(2, "Básico", "Ligação tentando desconto no momento da saída."),
        opt(3, "Intermediário", "Análise periódica dos motivos."),
        opt(4, "Avançado", "Monitoramento de sinais de alerta."),
        opt(5, "Líder", "Sistema preditivo com intervenção automatizada."),
      ]},
      { id: "5.4", text: "Como a empresa estimula upsell e cross-sell?", options: [
        opt(1, "Inexistente", "Clientes compram uma vez ou sob demanda."),
        opt(2, "Básico", "Avisos esporádicos sobre novos lançamentos."),
        opt(3, "Intermediário", "Upgrades oferecidos perto da renovação."),
        opt(4, "Avançado", "Jornada estruturada baseada em tempo de uso."),
        opt(5, "Líder", "Motor de recomendação gerando receita recorrente."),
      ]},
      { id: "5.5", text: "Qual é o nível de organização do Suporte ao cliente?", options: [
        opt(1, "Caótico", "WhatsApp pessoal de vários atendentes."),
        opt(2, "Básico", "E-mail ou grupo sem controle de prazo."),
        opt(3, "Intermediário", "Chamados simples com SLA básico."),
        opt(4, "Avançado", "Central integrada com metas de resolução."),
        opt(5, "Líder", "Omnicanal hiper-rápido com base dinâmica."),
      ]},
      { id: "5.6", text: "Como são tratados os clientes promotores?", options: [
        opt(1, "Desperdiçados", "Elogios sem ação."),
        opt(2, "Básico", "Pedimos indicações informalmente."),
        opt(3, "Intermediário", "Programa básico de indique e ganhe."),
        opt(4, "Avançado", "Programa estruturado com recompensas claras."),
        opt(5, "Líder", "Comunidade VIP engajada em cocriação e vendas."),
      ]},
      { id: "5.7", text: "Velocidade e precisão de resolução técnica (Customer Success)?", options: [
        opt(1, "Lenta", "Depende do aval dos diretores."),
        opt(2, "Básico", "Operação resolve, sem prazo de garantia."),
        opt(3, "Intermediário", "SLA estruturado, cumprido esporadicamente."),
        opt(4, "Avançado", "Equipe com autonomia e orçamento de reparo."),
        opt(5, "Líder", "Resolução preventiva antes do cliente perceber."),
      ]},
    ],
  },
  {
    id: "ia",
    name: "Inteligência Artificial",
    icon: Sparkles,
    questions: [
      { id: "6.1", text: "Como a equipe utiliza IA gerativa (ChatGPT, Claude) no dia a dia?", options: [
        opt(1, "Não utilizam", "Ferramentas fora da rotina."),
        opt(2, "Básico", "Alguns usam esporadicamente para textos simples."),
        opt(3, "Intermediário", "Uso regular sem diretrizes corporativas."),
        opt(4, "Avançado", "Uso institucionalizado com diretrizes e segurança."),
        opt(5, "Líder", "Equipe capacitada com atalhos e automações personalizadas."),
      ]},
      { id: "6.2", text: "Nível de automação de tarefas manuais repetitivas com IA?", options: [
        opt(1, "Zero", "Processos manuais consomem grande parte do tempo."),
        opt(2, "Básico", "Make/Zapier sem IA complexa integrada."),
        opt(3, "Intermediário", "Agentes básicos de IA em triagem pontual."),
        opt(4, "Avançado", "Workflows com APIs de IA ponta a ponta."),
        opt(5, "Líder", "Robôs inteligentes executam fluxos complexos de backoffice."),
      ]},
      { id: "6.3", text: "Como a IA é usada no atendimento ou triagem inicial de clientes?", options: [
        opt(1, "Ausente", "Todo atendimento é humano desde o início."),
        opt(2, "Básico", "URAs numéricas que frustram o cliente."),
        opt(3, "Intermediário", "Chatbots simples baseados em regras rígidas."),
        opt(4, "Avançado", "Assistentes com IA gerativa contextualizada."),
        opt(5, "Líder", "Agente autônomo resolvendo chamados complexos."),
      ]},
      { id: "6.4", text: "Como os dados da empresa alimentam sistemas de IA?", options: [
        opt(1, "Não fazemos", "Dados espalhados em PDFs e mensagens."),
        opt(2, "Básico", "Copy/paste em ferramentas públicas manualmente."),
        opt(3, "Intermediário", "Base em PDF para consulta de assistentes."),
        opt(4, "Avançado", "RAG estruturado com base interna segura."),
        opt(5, "Líder", "Fine-tuning de modelos proprietários contínuo."),
      ]},
      { id: "6.5", text: "Como a IA apoia marketing e redação de anúncios?", options: [
        opt(1, "Nulo", "Produção manual do início ao fim."),
        opt(2, "Básico", "IA só para corrigir gramática."),
        opt(3, "Intermediário", "IA escreve versão inicial dos criativos."),
        opt(4, "Avançado", "Modelos com voz da marca escrevem anúncios e criam imagens."),
        opt(5, "Líder", "Geração em larga escala por público com análise preditiva."),
      ]},
      { id: "6.6", text: "Como a IA é usada em análise de dados operacionais e financeiros?", options: [
        opt(1, "Não utilizamos", "Análise manual em planilhas simples."),
        opt(2, "Básico", "Colamos planilhas no ChatGPT pedindo conclusões."),
        opt(3, "Intermediário", "Relatórios mensais com resumos gerados por IA."),
        opt(4, "Avançado", "Dashboards com IA identificando padrões e anomalias."),
        opt(5, "Líder", "Predição de vendas com alocação orçamentária automática."),
      ]},
      { id: "6.7", text: "Nível de governança, ética e segurança no uso de IA?", options: [
        opt(1, "Ignorado", "Sem controle do que a equipe insere."),
        opt(2, "Básico", "Recomendação genérica de não colocar dados sensíveis."),
        opt(3, "Intermediário", "Diretiva simples proibindo segredos industriais."),
        opt(4, "Avançado", "Política rígida com canal oficial (Enterprise API)."),
        opt(5, "Líder", "Governança completa com auditorias e monitoramento."),
      ]},
    ],
  },
];

// ————————————————————————————————————————————————————————
// Page
// ————————————————————————————————————————————————————————
type Stage = "intro" | "quiz" | "result";
type Answers = Record<string, 1 | 2 | 3 | 4 | 5>;

/** Todas as perguntas em sequência, cada uma sabendo a que pilar pertence. */
type FlatQuestion = Question & { catIndex: number; catName: string; catId: string; icon: Category["icon"]; indexInCat: number };

const FLAT: FlatQuestion[] = CATEGORIES.flatMap((c, catIndex) =>
  c.questions.map((q, indexInCat) => ({
    ...q,
    catIndex,
    catName: c.name,
    catId: c.id,
    icon: c.icon,
    indexInCat,
  })),
);

function DiagnosticoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("intro");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});

  const totalAnswered = Object.keys(answers).length;
  const allDone = totalAnswered === FLAT.length;

  const reset = () => {
    setAnswers({});
    setStep(0);
    setStage("intro");
  };

  const start = () => {
    // Retoma na primeira pergunta ainda sem resposta.
    const first = FLAT.findIndex((q) => !answers[q.id]);
    setStep(first === -1 ? 0 : first);
    setStage("quiz");
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} current="/diagnostico" />
      <main className="relative flex min-h-screen flex-1 flex-col">
        <div className="hidden lg:block"><TopBar /></div>
        <div className="lg:hidden"><MobileTopBar /></div>

        {stage === "intro" && <IntroStage onStart={start} hasAnswers={totalAnswered > 0} answered={totalAnswered} />}

        {stage === "quiz" && (
          <QuizStage
            step={step}
            setStep={setStep}
            answers={answers}
            setAnswers={setAnswers}
            allDone={allDone}
            onFinish={() => setStage("result")}
          />
        )}

        {stage === "result" && <ResultStage answers={answers} onRestart={reset} />}

        <div className="lg:hidden"><MobileTabBar current="/diagnostico" /></div>
      </main>
    </div>
  );
}

// ————————————————————————————————————————————————————————
// Intro
// ————————————————————————————————————————————————————————
function IntroStage({
  onStart, hasAnswers, answered,
}: {
  onStart: () => void;
  hasAnswers: boolean;
  answered: number;
}) {
  return (
    <section className="relative flex-1 overflow-hidden px-6 py-14 md:px-14 md:py-20">
      {/* Luzes azuis ao fundo */}
      <div
        className="lure-aurora lure-aurora-a -left-24 top-0 h-[420px] w-[420px]"
        style={{ background: "rgba(187, 154, 53, 0.28)" }}
        aria-hidden
      />
      <div
        className="lure-aurora lure-aurora-b right-0 top-40 h-[380px] w-[380px]"
        style={{ background: "rgba(212, 184, 92, 0.20)" }}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-14 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <div
            className="lure-rise inline-flex items-center gap-2 rounded-full border border-[var(--nav)]/30 bg-[var(--nav)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--nav)]"
            style={{ "--d": "0ms" } as React.CSSProperties}
          >
            <Hexagon className="h-3 w-3" /> Diagnóstico de Maturidade
          </div>

          <h1
            className="lure-rise mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl"
            style={{ "--d": "90ms" } as React.CSSProperties}
          >
            Avalie as principais áreas{" "}
            <span className="bg-gradient-to-r from-[#EBDDA9] to-[#BB9A35] bg-clip-text text-transparent">
              da sua empresa
            </span>
          </h1>

          <p
            className="lure-rise mt-6 max-w-lg text-[15px] leading-relaxed text-muted-foreground"
            style={{ "--d": "180ms" } as React.CSSProperties}
          >
            Um raio-x completo do seu negócio em 6 pilares. No final você recebe a Roda da
            Maturidade e um plano de ação priorizado pelo método LURE Growth.
          </p>

          {/* Pilares */}
          <div className="mt-8 flex flex-wrap gap-2">
            {CATEGORIES.map((c, i) => (
              <span
                key={c.id}
                className="lure-rise inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
                style={{ "--d": `${240 + i * 60}ms` } as React.CSSProperties}
              >
                <c.icon className="h-3.5 w-3.5 text-[var(--nav)]" />
                {c.name}
              </span>
            ))}
          </div>

          <div
            className="lure-rise mt-10 flex flex-wrap items-center gap-4"
            style={{ "--d": "640ms" } as React.CSSProperties}
          >
            <button
              onClick={onStart}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full gradient-gold px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_10px_40px_-12px_var(--nav)] transition hover:scale-[1.03]"
            >
              <span
                className="diag-sweep pointer-events-none absolute inset-y-0 -left-4 w-10 bg-white/25 blur-md"
                aria-hidden
              />
              <span className="relative">{hasAnswers ? "Continuar diagnóstico" : "Iniciar diagnóstico"}</span>
              <ArrowRight className="relative h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            {hasAnswers && (
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{answered}</span>/{FLAT.length} respondidas
              </span>
            )}
          </div>

          {/* Métricas */}
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[
              { icon: Target, label: "Pilares", value: String(CATEGORIES.length) },
              { icon: BarChart3, label: "Perguntas", value: String(FLAT.length) },
              { icon: Clock, label: "Duração", value: "~8 min" },
            ].map((s, i) => (
              <div
                key={s.label}
                className="lure-rise rounded-2xl border border-border/60 bg-surface/40 px-4 py-3"
                style={{ "--d": `${700 + i * 80}ms` } as React.CSSProperties}
              >
                <s.icon className="h-4 w-4 text-[var(--nav)]" />
                <div className="mt-2 font-display text-xl font-bold tabular-nums">{s.value}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card visual */}
        <div
          className="lure-rise relative overflow-hidden rounded-3xl border border-[var(--nav)]/25 bg-surface/40 p-6 shadow-[0_30px_80px_-40px_var(--nav)]"
          style={{ "--d": "320ms" } as React.CSSProperties}
        >
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(ellipse_at_center,var(--nav),transparent_70%)] opacity-20" />
          <div className="relative flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Evolução do Diagnóstico
            </div>
            <span className="rounded-full bg-[var(--nav)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--nav)]">
              360°
            </span>
          </div>

          <div className="relative mt-6 flex h-40 items-end gap-4">
            {[35, 55, 75, 100].map((h, i) => (
              <div
                key={i}
                className={`diag-bar flex-1 rounded-lg ${
                  i === 3
                    ? "gradient-gold shadow-[0_0_40px_-6px_var(--nav)]"
                    : "bg-gradient-to-t from-muted/40 to-[var(--nav)]/15"
                }`}
                style={{ "--h": `${h}%`, "--d": `${400 + i * 130}ms`, height: `${h}%` } as React.CSSProperties}
              />
            ))}
          </div>

          <div className="relative mt-8 grid grid-cols-2 gap-4">
            <MiniCard label="Visão em Gráfico" value="Radar 360°" />
            <MiniCard label="Dossiê de IA" value="Plano de Ação" />
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 transition hover:border-[var(--nav)]/40">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-sm font-semibold">{value}</div>
    </div>
  );
}

// ————————————————————————————————————————————————————————
// Quiz
// ————————————————————————————————————————————————————————
function QuizStage({
  step, setStep, answers, setAnswers, allDone, onFinish,
}: {
  step: number;
  setStep: (i: number) => void;
  answers: Answers;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
  allDone: boolean;
  onFinish: () => void;
}) {
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const q = FLAT[step];
  const selected = answers[q.id];
  const answeredCount = Object.keys(answers).length;
  const isLast = step === FLAT.length - 1;

  const go = useCallback(
    (target: number, direction: "fwd" | "back") => {
      if (target < 0 || target >= FLAT.length) return;
      setDir(direction);
      setStep(target);
    },
    [setStep],
  );

  const pick = useCallback(
    (score: 1 | 2 | 3 | 4 | 5) => {
      setAnswers((prev) => ({ ...prev, [q.id]: score }));
      // Pequena pausa para o usuário ver a seleção antes de avançar.
      if (step < FLAT.length - 1) {
        window.setTimeout(() => go(step + 1, "fwd"), 340);
      }
    },
    [q.id, step, go, setAnswers],
  );

  // Atalhos: 1-5 responde, setas navegam.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "5") pick(Number(e.key) as 1 | 2 | 3 | 4 | 5);
      else if (e.key === "ArrowRight") go(step + 1, "fwd");
      else if (e.key === "ArrowLeft") go(step - 1, "back");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick, go, step]);

  return (
    <section className="relative flex-1 overflow-hidden px-4 py-8 md:px-10 md:py-12">
      <div
        className="lure-aurora lure-aurora-a left-1/4 top-0 h-[380px] w-[380px]"
        style={{ background: "rgba(187, 154, 53, 0.18)" }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-3xl">
        {/* Trilha de pilares */}
        <div className="flex items-center gap-1.5">
          {CATEGORIES.map((c, i) => {
            const done = c.questions.filter((x) => answers[x.id]).length;
            const pctCat = (done / c.questions.length) * 100;
            const active = i === q.catIndex;
            const firstOfCat = FLAT.findIndex((f) => f.catIndex === i);
            return (
              <button
                key={c.id}
                onClick={() => go(firstOfCat, firstOfCat > step ? "fwd" : "back")}
                title={`${c.name} — ${done}/${c.questions.length}`}
                className="group flex-1"
              >
                <div
                  className={`h-1.5 overflow-hidden rounded-full transition ${
                    active ? "bg-[var(--nav)]/25" : "bg-muted/50 group-hover:bg-muted"
                  }`}
                >
                  <div
                    className="h-full rounded-full bg-[var(--nav)] transition-all duration-500"
                    style={{ width: `${pctCat}%` }}
                  />
                </div>
                <div
                  className={`mt-2 hidden truncate text-[10px] font-semibold uppercase tracking-[0.14em] transition md:block ${
                    active ? "text-[var(--nav)]" : "text-muted-foreground/60 group-hover:text-muted-foreground"
                  }`}
                >
                  {c.name.split(" ")[0]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Cabeçalho da pergunta */}
        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--nav)]/30 bg-[var(--nav)]/10 text-[var(--nav)]">
              <q.icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--nav)]">
                {q.catName}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                Pergunta {step + 1} de {FLAT.length} · {answeredCount} respondidas
              </div>
            </div>
          </div>
          <div className="font-display text-3xl font-bold tabular-nums text-muted-foreground/30">
            {String(step + 1).padStart(2, "0")}
          </div>
        </div>

        {/* Pergunta + opções (remonta a cada passo para reanimar) */}
        <div key={q.id} className={dir === "fwd" ? "diag-in-fwd" : "diag-in-back"}>
          <h2 className="mt-8 font-display text-2xl font-semibold leading-snug tracking-tight md:text-[30px]">
            {q.text}
          </h2>

          <div className="mt-7 flex flex-col gap-2.5">
            {q.options.map((o, i) => {
              const active = selected === o.score;
              return (
                <button
                  key={o.score}
                  onClick={() => pick(o.score)}
                  className={`diag-option group relative flex items-start gap-4 overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 ${
                    active
                      ? "diag-pick border-[var(--nav)]/70 bg-[var(--nav)]/12 shadow-[0_0_30px_-10px_var(--nav)]"
                      : "border-border/50 bg-surface/40 hover:-translate-y-0.5 hover:border-[var(--nav)]/40 hover:bg-surface/70"
                  }`}
                  style={{ "--d": `${i * 70}ms` } as React.CSSProperties}
                >
                  {active && (
                    <span
                      className="diag-ripple pointer-events-none absolute left-8 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--nav)]/30"
                      aria-hidden
                    />
                  )}
                  <span
                    className={`relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold tabular-nums transition ${
                      active
                        ? "gradient-gold text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {active ? <Check className="h-4 w-4" /> : o.score}
                  </span>
                  <span className="relative text-[14px] leading-relaxed">
                    <span className={active ? "font-semibold text-foreground" : "font-semibold text-foreground/90"}>
                      {o.label}
                    </span>
                    <span className="text-muted-foreground"> — {o.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navegação */}
        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={() => go(step - 1, "back")}
            disabled={step === 0}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm text-muted-foreground transition hover:border-border hover:text-foreground disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" /> Anterior
          </button>

          <div className="hidden text-[11px] text-muted-foreground sm:block">
            Dica: use as teclas <kbd className="rounded bg-muted/60 px-1.5 py-0.5 font-mono">1</kbd>–
            <kbd className="rounded bg-muted/60 px-1.5 py-0.5 font-mono">5</kbd> para responder
          </div>

          {isLast ? (
            <button
              onClick={onFinish}
              disabled={!allDone}
              className="inline-flex items-center gap-2 rounded-full gradient-gold px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_10px_40px_-12px_var(--nav)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              Gerar diagnóstico <Sparkles className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => go(step + 1, "fwd")}
              disabled={!selected}
              className="inline-flex items-center gap-2 rounded-full gradient-gold px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_10px_40px_-12px_var(--nav)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Progresso geral */}
        <div className="mt-8">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Progresso geral</span>
            <span className="tabular-nums">{Math.round((answeredCount / FLAT.length) * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full rounded-full gradient-gold transition-all duration-700"
              style={{ width: `${(answeredCount / FLAT.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ————————————————————————————————————————————————————————
// Result
// ————————————————————————————————————————————————————————
function classify(avg: number) {
  if (avg < 3) return { label: "Crítico", tone: "critical" as const };
  if (avg < 4.2) return { label: "Estável", tone: "stable" as const };
  return { label: "Excelente", tone: "excellent" as const };
}

function ResultStage({ answers, onRestart }: { answers: Answers; onRestart: () => void }) {
  const scores = useMemo(() => {
    return CATEGORIES.map((c) => {
      const sum = c.questions.reduce((a, q) => a + (answers[q.id] || 0), 0);
      const avg = sum / c.questions.length;
      return { id: c.id, name: c.name, icon: c.icon, avg, ...classify(avg) };
    });
  }, [answers]);

  const overall = useMemo(() => {
    const total = scores.reduce((a, s) => a + s.avg, 0) / scores.length;
    return { avg: total, ...classify(total) };
  }, [scores]);

  const sorted = [...scores].sort((a, b) => b.avg - a.avg);
  const strengths = sorted.slice(0, 2);
  const weaknesses = [...sorted].reverse().slice(0, 2);

  return (
    <section className="flex-1 px-4 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--nav)]">
              Roda da Maturidade
            </div>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
              Seu diagnóstico está pronto
            </h1>
          </div>
          <button
            onClick={onRestart}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Refazer
          </button>
        </div>

        {/* Overall + Radar */}
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-surface/50 p-8">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Média Geral
            </div>
            <div className="mt-4 flex items-baseline gap-3">
              <div className="font-display text-7xl font-bold tabular-nums text-foreground">
                {overall.avg.toFixed(1)}
              </div>
              <div className="text-muted-foreground">/ 5.0</div>
              <ToneBadge tone={overall.tone} label={overall.label} />
            </div>
            <div className="mt-8">
              <RadarChart scores={scores} />
            </div>
          </div>

          {/* Category list */}
          <div className="flex flex-col gap-3">
            {scores.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border/60 bg-surface/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="text-[13px] font-semibold">{s.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-display text-lg font-bold tabular-nums">{s.avg.toFixed(1)}</div>
                    <ToneBadge tone={s.tone} label={s.label} />
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full gradient-gold transition-all duration-700"
                    style={{ width: `${(s.avg / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Strengths / Weaknesses */}
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <InsightPanel
            icon={TrendingUp}
            title="Pontos fortes"
            accent="text-emerald-400"
            items={strengths.map((s) => ({ name: s.name, avg: s.avg }))}
          />
          <InsightPanel
            icon={AlertTriangle}
            title="Oportunidades de melhoria"
            accent="text-[var(--nav)]"
            items={weaknesses.map((s) => ({ name: s.name, avg: s.avg }))}
          />
        </div>

        {/* Action Plan */}
        <div className="mt-8 overflow-hidden rounded-3xl border border-[var(--nav)]/25 bg-gradient-to-br from-[var(--nav)]/12 via-surface/40 to-transparent p-8">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--nav)]">
            <Sparkles className="h-3.5 w-3.5" /> Plano de Ação Recomendado
          </div>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Comece pelas trilhas de <span className="text-[var(--nav)]">{weaknesses[0].name}</span>{" "}
            e <span className="text-[var(--nav)]">{weaknesses[1].name}</span>
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {weaknesses.map((w) => (
              <ActionCard key={w.id} name={w.name} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ToneBadge({ tone, label }: { tone: "critical" | "stable" | "excellent"; label: string }) {
  const styles = {
    critical: "border-destructive/40 bg-destructive/10 text-destructive",
    stable: "border-[var(--nav)]/40 bg-[var(--nav)]/10 text-[var(--nav)]",
    excellent: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  }[tone];
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${styles}`}>
      {label}
    </span>
  );
}

function InsightPanel({
  icon: Icon, title, accent, items,
}: {
  icon: typeof TrendingUp;
  title: string;
  accent: string;
  items: { name: string; avg: number }[];
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-surface/40 p-6">
      <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] ${accent}`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-border/30">
        {items.map((it) => (
          <li key={it.name} className="flex items-center justify-between py-3">
            <span className="text-[14px] font-medium">{it.name}</span>
            <span className="font-display text-lg font-bold tabular-nums text-foreground">
              {it.avg.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ACTION_LIBRARY: Record<string, string[]> = {
  "Gestão e Estratégia": [
    "Documente a visão de 3 anos e desdobre em OKRs trimestrais com rituais semanais.",
    "Implante DRE mensal + previsão orçamentária de 12 meses.",
    "Crie playbooks dos 5 processos mais críticos e revise a cada 90 dias.",
    "Monte um dashboard executivo com no máximo 8 KPIs de decisão.",
  ],
  "Cultura e Liderança": [
    "Formalize valores e integre-os no processo de contratação, feedback e demissão.",
    "Implemente 1-on-1s mensais estruturados entre líderes e liderados.",
    "Crie um onboarding de 30 dias com metas de ativação por cargo.",
    "Rode e-NPS trimestral com plano de ação por área.",
  ],
  "Marketing e Demanda": [
    "Redefina o ICP com dores, gatilhos e canais preferidos — documente em 1 página.",
    "Monte um funil mensurável (visitante → lead → MQL → SQL → cliente).",
    "Escale tráfego pago com metas de CAC e LTV por canal.",
    "Construa autoridade com uma máquina de conteúdo semanal alinhada ao funil.",
  ],
  "Vendas e Conversão": [
    "Adote e discipline o uso de um CRM com regras rígidas de movimentação.",
    "Escreva o Playbook Comercial com scripts, objeções e cases.",
    "Rode roleplays semanais e escute gravações do time.",
    "Implemente Lead Scoring e SDR dedicado para qualificação.",
  ],
  "Experiência e Clientes": [
    "Construa um onboarding do cliente focado no Primeiro Valor Percebido em ≤30 dias.",
    "Rode NPS transacional contínuo com tratativa obrigatória de detratores.",
    "Crie sinais de alerta de churn e uma rotina proativa de Customer Success.",
    "Estruture programa de indicação com recompensa clara e rastreamento.",
  ],
  "Inteligência Artificial": [
    "Publique uma política corporativa de IA (o que pode e o que não pode).",
    "Mapeie 5 processos repetitivos e automatize com IA (Make/n8n + LLM).",
    "Implante RAG sobre a base interna (FAQs, playbooks, contratos).",
    "Treine cada área em prompts específicos da sua função.",
  ],
};

function ActionCard({ name }: { name: string }) {
  const actions = ACTION_LIBRARY[name] || [];
  return (
    <div className="rounded-2xl border border-border/60 bg-background/50 p-6">
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--nav)]">
        Trilha prioritária
      </div>
      <div className="mt-2 font-display text-xl font-semibold">{name}</div>
      <ul className="mt-5 flex flex-col gap-3">
        {actions.map((a, i) => (
          <li key={i} className="flex items-start gap-3 text-[13.5px] leading-relaxed">
            <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--nav)]/15 text-[var(--nav)]">
              <Check className="h-3 w-3" />
            </span>
            <span className="text-foreground/85">{a}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ————————————————————————————————————————————————————————
// Radar chart (SVG)
// ————————————————————————————————————————————————————————
function RadarChart({ scores }: { scores: { name: string; avg: number }[] }) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 120;
  const n = scores.length;

  const point = (i: number, value: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (value / 5) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  };

  const axisEnd = (i: number) => point(i, 5);
  const polygon = scores.map((s, i) => point(i, s.avg).join(",")).join(" ");

  return (
    <div className="mx-auto max-w-md">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full">
        {/* Rings */}
        {[1, 2, 3, 4, 5].map((r) => (
          <polygon
            key={r}
            points={scores.map((_, i) => point(i, r).join(",")).join(" ")}
            fill="none"
            stroke="#232936"
            strokeWidth={0.5}
          />
        ))}
        {/* Axes */}
        {scores.map((_, i) => {
          const [x, y] = axisEnd(i);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#232936"
              strokeWidth={0.5}
            />
          );
        })}
        {/* Filled shape */}
        <polygon
          points={polygon}
          fill="rgba(187, 154, 53, 0.25)"
          stroke="#BB9A35"
          strokeWidth={1.5}
        />
        {/* Points */}
        {scores.map((s, i) => {
          const [x, y] = point(i, s.avg);
          return <circle key={i} cx={x} cy={y} r={3} fill="#D4B85C" />;
        })}
        {/* Labels */}
        {scores.map((s, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const lx = cx + (radius + 22) * Math.cos(angle);
          const ly = cy + (radius + 22) * Math.sin(angle);
          const short = s.name.split(" ")[0];
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}
            >
              {short}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
