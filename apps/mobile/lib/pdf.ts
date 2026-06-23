import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import { getBriefPdfUrl } from './api';

export async function openBriefPdf(
  depIcao: string,
  arrIcao: string,
  crossLimit?: number
) {
  const pdfUrl = getBriefPdfUrl(depIcao, arrIcao, crossLimit);

  if (Platform.OS === 'web') {
    window.open(pdfUrl, '_blank');
    return;
  }

  const fileName = `flight-risk-${depIcao}-${arrIcao}.pdf`;
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;

  try {
    const downloadResult = await FileSystem.downloadAsync(pdfUrl, fileUri);

    const canShare = await Sharing.isAvailableAsync();

    if (canShare) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Flight-Risk PDF Brifingi',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Linking.openURL(downloadResult.uri);
  } catch (error) {
    console.error('PDF export failed:', error);
    Alert.alert(
      'PDF Hatası',
      'PDF brifing oluşturulurken veya açılırken bir hata oluştu.'
    );
  }
}