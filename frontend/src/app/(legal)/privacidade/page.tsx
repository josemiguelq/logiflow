import type { Metadata } from 'next'
import { Section, Bullets, PageTitle } from '../_ui'

export const metadata: Metadata = {
  title: 'Política de Privacidade — LogiFlow',
  description: 'Como o LogiFlow coleta, usa e protege os dados pessoais.',
}

const CONTACT = 'privacidade@logiflow-app.com.br'

export default function PrivacyPage() {
  return (
    <>
      <PageTitle title="Política de Privacidade" updated="2 de junho de 2026" />

      <Section title="1. Quem somos">
        <p>
          O LogiFlow é uma plataforma de gestão de entregas urbanas composta por um painel
          web (para as lojas) e um aplicativo móvel (para os entregadores). Esta Política
          descreve como tratamos os dados pessoais ao usar o LogiFlow, em conformidade com a
          Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).
        </p>
        <p>
          Nesta relação, cada <strong>loja</strong> é a controladora dos dados de seus
          clientes e entregadores, e o LogiFlow atua como <strong>operador</strong>,
          tratando os dados conforme as instruções da loja e o necessário para prestar o
          serviço.
        </p>
      </Section>

      <Section title="2. Dados que coletamos">
        <Bullets
          items={[
            <><strong>Usuários da loja</strong>: nome, e-mail, nome de usuário e senha (armazenada de forma criptografada).</>,
            <><strong>Entregadores</strong>: nome, nome de usuário, e-mail (opcional), foto de perfil, status e <strong>localização geográfica (GPS)</strong> durante as entregas.</>,
            <><strong>Clientes</strong> (cadastrados pelas lojas): nome, telefone, endereço(s) e coordenadas de entrega.</>,
            <><strong>Pedidos e entregas</strong>: itens/observações, códigos de coleta e entrega, e <strong>fotos de comprovante</strong> de entrega (que podem incluir a geolocalização do momento da foto).</>,
            <><strong>Dados de dispositivo</strong>: token de notificação push (FCM) e dados técnicos de diagnóstico e erros para estabilidade do serviço.</>,
          ]}
        />
      </Section>

      <Section title="3. Como usamos os dados">
        <Bullets
          items={[
            'Operar a plataforma: criar e gerenciar pedidos, rotas, entregadores e clientes.',
            'Rastrear entregas em tempo real e permitir que o cliente acompanhe o pedido por um link.',
            'Confirmar coleta e entrega (códigos e fotos de comprovante).',
            'Enviar notificações sobre o status do pedido ao cliente e ao entregador.',
            'Garantir segurança, prevenir fraudes e monitorar a estabilidade do sistema.',
            'Cumprir obrigações legais e regulatórias.',
          ]}
        />
      </Section>

      <Section title="4. Localização (GPS)">
        <p>
          A localização é coletada <strong>apenas pelo aplicativo do entregador</strong> e
          <strong> somente durante a operação de entrega</strong>, com o objetivo de mostrar
          a posição em tempo real à loja e ao cliente que acompanha o pedido. O entregador
          pode revogar a permissão de localização a qualquer momento nas configurações do
          dispositivo — sem ela, o rastreamento em tempo real não funcionará.
        </p>
      </Section>

      <Section title="5. Permissões do aplicativo">
        <Bullets
          items={[
            <><strong>Localização</strong>: para rastreamento das entregas em andamento.</>,
            <><strong>Câmera</strong>: para registrar fotos de comprovante de entrega.</>,
            <><strong>Notificações</strong>: para avisar o entregador sobre novos pedidos e mudanças de rota.</>,
          ]}
        />
      </Section>

      <Section title="6. Compartilhamento com terceiros">
        <p>
          Não vendemos dados pessoais. Compartilhamos dados apenas com provedores que
          viabilizam o serviço, na medida do necessário:
        </p>
        <Bullets
          items={[
            'Google Firebase (Cloud Messaging) — envio de notificações push.',
            'Provedores de mapas (OpenStreetMap / Google Maps) — exibição de mapas e rotas.',
            'Supabase — banco de dados e armazenamento das imagens de comprovante.',
            'Provedores de hospedagem (ex.: Vercel e Render) — execução da aplicação.',
            'Sentry — monitoramento de erros e desempenho.',
            'WhatsApp — envio de notificações de status ao cliente, quando habilitado pela loja.',
          ]}
        />
      </Section>

      <Section title="7. Retenção e exclusão">
        <p>
          Mantemos os dados pelo tempo necessário para prestar o serviço e cumprir
          obrigações legais. Lojas podem excluir clientes, pedidos e entregadores pelo
          painel. Encerrada a conta, os dados associados são removidos ou anonimizados,
          ressalvadas as hipóteses de guarda legal.
        </p>
      </Section>

      <Section title="8. Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo
          criptografia de senhas, transmissão por HTTPS e controle de acesso por loja
          (isolamento entre lojas) e por perfil de usuário.
        </p>
      </Section>

      <Section title="9. Seus direitos (LGPD)">
        <p>O titular pode, a qualquer momento, solicitar:</p>
        <Bullets
          items={[
            'Confirmação da existência de tratamento e acesso aos dados;',
            'Correção de dados incompletos, inexatos ou desatualizados;',
            'Anonimização, bloqueio ou eliminação de dados desnecessários;',
            'Portabilidade e informação sobre compartilhamento;',
            'Revogação do consentimento e exclusão dos dados tratados com base nele.',
          ]}
        />
        <p>
          Como cada loja é a controladora dos dados de seus clientes/entregadores, pedidos
          relativos a esses dados podem ser encaminhados à respectiva loja. Você também pode
          falar conosco pelo contato abaixo.
        </p>
      </Section>

      <Section title="10. Crianças e adolescentes">
        <p>
          O LogiFlow não é destinado a menores de 18 anos e não coletamos intencionalmente
          dados de crianças e adolescentes.
        </p>
      </Section>

      <Section title="11. Alterações desta Política">
        <p>
          Podemos atualizar esta Política periodicamente. A data de “Última atualização” no
          topo indica a versão vigente; alterações relevantes serão comunicadas pelos canais
          do serviço.
        </p>
      </Section>

      <Section title="12. Contato">
        <p>
          Dúvidas ou solicitações sobre privacidade e proteção de dados podem ser enviadas
          para <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </Section>
    </>
  )
}
