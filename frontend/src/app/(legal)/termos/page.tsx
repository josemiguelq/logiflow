import type { Metadata } from 'next'
import { Section, Bullets, PageTitle } from '../_ui'

export const metadata: Metadata = {
  title: 'Termos de Uso — LogiFlow',
  description: 'Termos e condições de uso da plataforma LogiFlow.',
}

const CONTACT = 'contato@logiflow-app.com.br'

export default function TermsPage() {
  return (
    <>
      <PageTitle title="Termos de Uso" updated="2 de junho de 2026" />

      <Section title="1. Aceitação">
        <p>
          Ao acessar ou utilizar o LogiFlow — painel web e aplicativo do entregador — você
          concorda com estes Termos de Uso e com a{' '}
          <a className="text-blue-600 hover:underline" href="/privacidade">Política de Privacidade</a>.
          Caso não concorde, não utilize o serviço.
        </p>
      </Section>

      <Section title="2. Descrição do serviço">
        <p>
          O LogiFlow é uma plataforma de gestão de entregas urbanas que permite às lojas
          cadastrar clientes e pedidos, atribuir entregadores, planejar rotas, acompanhar
          entregas em tempo real e registrar comprovantes. O aplicativo do entregador
          permite aceitar pedidos, navegar até os clientes e confirmar coleta e entrega.
        </p>
      </Section>

      <Section title="3. Cadastro e contas">
        <Bullets
          items={[
            'O acesso depende de credenciais individuais. Você é responsável por manter a confidencialidade da sua senha e por toda atividade realizada na sua conta.',
            'As informações fornecidas no cadastro devem ser verdadeiras, completas e atualizadas.',
            'Contas de usuários da loja possuem diferentes perfis e permissões, definidos pela própria loja.',
          ]}
        />
      </Section>

      <Section title="4. Responsabilidades da loja">
        <Bullets
          items={[
            'A loja é a controladora dos dados de seus clientes e entregadores e é responsável por ter base legal para cadastrá-los e tratá-los.',
            'A loja deve garantir que o uso de notificações (incluindo WhatsApp) e do rastreamento esteja de acordo com a legislação aplicável e com o consentimento necessário.',
            'A loja é responsável pela veracidade dos pedidos, endereços e demais dados inseridos na plataforma.',
          ]}
        />
      </Section>

      <Section title="5. Relação entre a loja e o entregador">
        <Bullets
          items={[
            'O vínculo e o contrato — de trabalho ou de prestação de serviços — são estabelecidos diretamente entre a loja e o entregador. O LogiFlow é apenas uma ferramenta de software e não intermedia, não contrata e não é parte dessa relação.',
            'Remuneração, ajustes de valores, férias, descanso, seguro, benefícios, jornada e demais obrigações trabalhistas ou contratuais são de responsabilidade exclusiva da loja.',
            'O LogiFlow não é empregador nem tomador de serviços do entregador e não responde por obrigações decorrentes dessa relação.',
          ]}
        />
      </Section>

      <Section title="6. Uso aceitável">
        <p>Ao usar o LogiFlow, você concorda em não:</p>
        <Bullets
          items={[
            'Violar leis, direitos de terceiros ou estes Termos;',
            'Tentar acessar dados de outras lojas ou contas sem autorização;',
            'Interferir, sobrecarregar ou comprometer a segurança e a integridade do serviço;',
            'Utilizar a plataforma para fins fraudulentos ou enganosos.',
          ]}
        />
      </Section>

      <Section title="7. Planos e cobrança">
        <p>
          Alguns recursos podem depender do plano contratado pela loja. Quando houver
          cobrança ou assinatura, as condições, valores e ciclos serão informados no momento
          da contratação. Recursos premium podem ser limitados conforme o plano vigente.
        </p>
      </Section>

      <Section title="8. Propriedade intelectual">
        <p>
          O software, a marca e os elementos do LogiFlow são protegidos por direitos de
          propriedade intelectual. Estes Termos não concedem qualquer direito sobre a marca
          ou o código, exceto o uso da plataforma conforme aqui previsto. Os dados inseridos
          pela loja permanecem de titularidade dela.
        </p>
      </Section>

      <Section title="9. Disponibilidade e isenções">
        <p>
          O serviço é fornecido “no estado em que se encontra”. Empregamos esforços
          razoáveis para mantê-lo disponível e seguro, mas não garantimos operação
          ininterrupta ou livre de erros. Recursos que dependem de terceiros (mapas,
          notificações, GPS do dispositivo) estão sujeitos à disponibilidade desses serviços.
        </p>
      </Section>

      <Section title="10. Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela lei, o LogiFlow não se responsabiliza por danos
          indiretos, lucros cessantes ou perdas decorrentes do uso ou da impossibilidade de
          uso do serviço, nem por atos praticados pelas lojas ou entregadores no
          relacionamento com seus clientes.
        </p>
      </Section>

      <Section title="11. Suspensão e encerramento">
        <p>
          Podemos suspender ou encerrar o acesso em caso de violação destes Termos, uso
          indevido ou risco à segurança. A loja pode encerrar sua conta a qualquer momento;
          o tratamento de dados após o encerramento segue a Política de Privacidade.
        </p>
      </Section>

      <Section title="12. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito
          o foro do domicílio do usuário para dirimir controvérsias, quando aplicável.
        </p>
      </Section>

      <Section title="13. Contato">
        <p>
          Dúvidas sobre estes Termos podem ser enviadas para{' '}
          <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </Section>
    </>
  )
}
