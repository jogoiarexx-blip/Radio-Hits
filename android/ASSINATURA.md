# Radio Hits — assinatura Android e atualizações (REV 1.7)

A compilação de release só é publicada quando os quatro segredos abaixo existem
no repositório GitHub em **Settings > Secrets and variables > Actions**:

- `RADIOHITS_KEYSTORE_BASE64`: conteúdo Base64 do mesmo arquivo .jks permanente.
- `RADIOHITS_KEYSTORE_PASSWORD`: senha do arquivo.
- `RADIOHITS_KEY_ALIAS`: alias da chave.
- `RADIOHITS_KEY_PASSWORD`: senha da chave.

**Nunca** adicionar a chave, senhas ou valores Base64 ao repositório ou a arquivos distribuídos.
Guardar cópia de segurança privada da chave: perder a chave impede atualizações
com o mesmo `applicationId` para instalações da release anterior.

A workflow gera sempre um APK de teste `app-debug.apk`. Havendo segredos completos,
gera também `app-release.apk` assinado e `SHA256SUMS.txt`. Sem segredos,
**não** distribui APK unsigned como se fosse uma release.

## Limitação de migração da versão 1.6

O APK de debug anterior não possuía identidade de assinatura release estável.
Um APK release assinado com nova chave não substitui aquele debug por atualização
in-place — o Android exige a mesma assinatura (ou rotação autorizada).
**Não desinstalar o APK antigo sem exportar dados**. Os downloads privados não são
movidos automaticamente de um pacote de assinatura diferente. O teste obrigatório
é instalar a primeira release estável, baixar três músicas e atualizar dessa release
para a versão seguinte com a mesma chave, sem desinstalar.

## Checklist de certificação

- [ ] Configurar segredos e preservar keystore fora do GitHub.
- [ ] Verificar SHA-256 do artifact release.
- [ ] Instalar release no Android 8+.
- [ ] Baixar três músicas e desligar internet.
- [ ] Instalar nova release assinada pela mesma chave com `versionCode` maior.
- [ ] Confirmar playlists, favoritos, arquivos privados e reprodução offline.
- [ ] Verificar botões/áudio ao minimizar e com tela bloqueada.

As compilações e verificações de JS não substituem os testes acima.
