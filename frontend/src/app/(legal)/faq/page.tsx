import type { Metadata } from 'next'
import { Section, Bullets, PageTitle } from '../_ui'

export const metadata: Metadata = {
  title: 'Perguntas Frequentes — LogiFlow',
  description: 'Dúvidas sobre segurança da informação, armazenamento de dados e conformidade com a LGPD no LogiFlow.',
}

const CONTACT = 'privacidade@logiflow-app.com.br'

export default function FAQPage() {
  return (
    <>
      <PageTitle title="Perguntas Frequentes" updated="14 de julho de 2026" />

      <Section title="Como o LogiFlow protege meus dados?">
        <p>
          Adotamos múltiplas camadas de segurança para proteger todas as informações
          armazenadas na plataforma:
        </p>
        <Bullets
          items={[
            <><strong>Senhas criptografadas</strong> — nenhuma senha é armazenada em texto plano; utilizamos algoritmos de hash com salt para garantir que nem nossos colaboradores tenham acesso às senhas.</>,
            <><strong>Transmissão criptografada (HTTPS)</strong> — todo o tráfego entre seu navegador, o painel web e o aplicativo mobile é criptografado via TLS.</>,
            <><strong>Controle de acesso por loja</strong> — cada loja só enxerga seus próprios dados. Não há acesso cruzado entre lojas.</>,
            <><strong>Controle de acesso por perfil</strong> — dentro de cada loja, cada usuário tem permissões definidas pelo administrador (escopos).</>,
            <><strong>Isolamento de infraestrutura</strong> — backend e banco de dados rodam em ambientes separados, com acesso restrito.</>,
          ]}
        />
      </Section>

      <Section title="Onde meus dados são armazenados?">
        <p>
          Os dados são armazenados em servidores seguros localizados no Brasil, em
          provedores confiáveis e de acordo com as melhores práticas do mercado:
        </p>
        <Bullets
          items={[
            <><strong>Banco de dados relacional (PostgreSQL)</strong> — armazena pedidos, clientes, entregadores, configurações da loja e registros de auditoria.</>,
            <><strong>Armazenamento de imagens (AWS S3)</strong> — fotos de comprovante de entrega são armazenadas de forma segura e com controle de acesso.</>,
            <><strong>Servidores de aplicação</strong> — o backend roda em infraestrutura gerenciada com monitoramento contínuo.</>,
            <><strong>Frontend hospedado na Vercel</strong> — o painel web é servido por uma rede global com certificado SSL automático.</>,
          ]}
        />
      </Section>

      <Section title="O LogiFlow está em conformidade com a LGPD?">
        <p>
          Sim. O LogiFlow opera em total conformidade com a <strong>Lei Geral de
          Proteção de Dados (LGPD – Lei nº 13.709/2018)</strong>. Nossa política de
          privacidade detalha como coletamos, usamos, compartilhamos e protegemos dados
          pessoais.
        </p>
        <p>
          Cada loja que utiliza o LogiFlow é a <strong>controladora</strong> dos dados de
          seus clientes e entregadores, e o LogiFlow atua como <strong>operador</strong>,
          tratando os dados exclusivamente conforme as instruções da loja e para fins de
          prestação do serviço.
        </p>
      </Section>

      <Section title="Posso solicitar a exclusão dos meus dados?">
        <p>
          <strong>Sim, a qualquer momento.</strong> De acordo com a LGPD, você tem
          direito de solicitar:
        </p>
        <Bullets
          items={[
            'A <strong>exclusão</strong> dos seus dados pessoais;',
            'A <strong>correção</strong> de dados incompletos ou desatualizados;',
            'A <strong>confirmação</strong> da existência de tratamento e acesso aos seus dados;',
            'A <strong>portabilidade</strong> dos seus dados;',
            'A <strong>revogação</strong> do consentimento para tratamento de dados.',
          ]}
        />
        <p>
          Para exercer qualquer um desses direitos, entre em contato pelo e-mail{' '}
          <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          . Solicitações de dados de clientes de uma loja específica também podem ser
          encaminhadas diretamente à loja responsável.
        </p>
      </Section>

      <Section title="Quem pode acessar os dados da minha loja?">
        <p>
          Apenas pessoas autorizadas pela administradora da loja podem acessar o painel.
          Cada usuário da loja possui um perfil com permissões específicas definidas pelo
          administrador, garantindo que cada pessoa veja apenas o que é relevante para sua
          função.
        </p>
        <p>
          Nenhum dado entre lojas é compartilhado. O isolamento é garantido
          tecnicamente pela arquitetura do sistema.
        </p>
      </Section>

      <Section title="Meus dados são vendidos para terceiros?">
        <p>
          <strong>Nunca.</strong> O LogiFlow não vende, aluga ou comercializa dados
          pessoais de ninguém. Compartilhamos dados apenas com provedores de serviço
          estritamente necessários para operar a plataforma (ex.: envio de notificações
          push, mapas, armazenamento de imagens), e todos operam sob acordos de
          confidencialidade e segurança.
        </p>
      </Section>

      <Section title="As fotos de comprovante de entrega são seguras?">
        <p>
          Sim. As fotos de comprovante são armazenadas em buckets privados da AWS S3 com
          controle de acesso restrito. Apenas a loja responsável e o sistema tienen
          acesso a essas imagens. As fotos são mantidas pelo tempo necessário para
          comprovação das entregas e possono ser excluídas a pedido da loja.
        </p>
      </Section>

      <Section title="A localização do entregador é rastreada o tempo todo?">
        <p>
          Não. A localização GPS é coletada <strong>apenas durante operações de
          entrega</strong> e somente pelo aplicativo do entregador. Fora desse contexto,
          nenhuma localização é registrada. O entregador pode revogar o acesso à
          localização a qualquer momento nas configurações do dispositivo, embora isso
          impeça o rastreamento em tempo real.
        </p>
      </Section>

      <Section title="O que acontece com meus dados se eu cancelar o serviço?">
        <p>
          Ao encerrar a conta ou cancelar o serviço, os dados associados à sua loja
          serão removidos ou anonimizados dentro de um prazo razoável, salvo quando houver
          obrigação legal de conservação. Você também pode solicitar a exclusão antecipada
          pelo e-mail{' '}
          <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>.
        </p>
      </Section>

      <Section title="Como reporto uma vulnerabilidade ou incidente de segurança?">
        <p>
          Levarmos segurança a sério. Se você identificou uma vulnerabilidade ou suspeita
          de uso indevido de dados, entre em contato imediatamente pelo e-mail{' '}
          <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          . Todas as solicitações são analisadas com prioridade.
        </p>
      </Section>
    </>
  )
}
