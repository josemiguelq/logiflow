class Announcement {
  final String id;
  final String? title;
  final String body;
  final String? emoji;
  final String? accentColor;
  final String? backgroundColor;
  final String? textColor;

  const Announcement({
    required this.id,
    required this.body,
    this.title,
    this.emoji,
    this.accentColor,
    this.backgroundColor,
    this.textColor,
  });

  factory Announcement.fromJson(Map<String, dynamic> j) => Announcement(
        id:              j['id'] as String,
        title:           j['title'] as String?,
        body:            j['body'] as String? ?? '',
        emoji:           j['emoji'] as String?,
        accentColor:     j['accentColor'] as String?,
        backgroundColor: j['backgroundColor'] as String?,
        textColor:       j['textColor'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id':              id,
        'title':           title,
        'body':            body,
        'emoji':           emoji,
        'accentColor':     accentColor,
        'backgroundColor': backgroundColor,
        'textColor':       textColor,
      };
}
