package com.lincelabs.logiflow

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {

    companion object {
        // Mantido em sincronia com o meta-data
        // com.google.firebase.messaging.default_notification_channel_id no
        // AndroidManifest. Trocar o id sempre que o som do canal mudar — o som
        // de um canal é imutável depois de criado, então bumpar o sufixo (_v2,
        // _v3...) é a forma garantida de aplicar um som novo sem desinstalar.
        const val ORDERS_CHANNEL_ID = "logiflow_orders_v2"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createOrdersChannel()
    }

    /**
     * Cria o canal de notificação dos pedidos com o som personalizado
     * (res/raw/motorcycle_fly). O FCM usa este canal por padrão (ver manifest),
     * então todo push passa a tocar este som, inclusive com o app fechado.
     * Canais persistem após criados, então isto roda só uma vez por instalação.
     */
    private fun createOrdersChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(ORDERS_CHANNEL_ID) != null) return

        // Forma canônica por id de recurso (android.resource://pkg/<int>) — é a
        // que o próprio Android gera, evita qualquer falha de resolução por nome.
        val soundUri = Uri.parse("android.resource://$packageName/${R.raw.motorcycle_fly}")
        val audioAttributes = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build()

        val channel = NotificationChannel(
            ORDERS_CHANNEL_ID,
            "Pedidos",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Notificações de novos pedidos e atualizações"
            setSound(soundUri, audioAttributes)
            enableVibration(true)
            enableLights(true)
        }
        manager.createNotificationChannel(channel)
    }
}
