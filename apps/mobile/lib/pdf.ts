import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import { getBriefPdfUrl } from './api';

export async function openBriefPdf(
  depIcao: string,
  arrIcao: string,
  crossLimit?: number
) {
  const dep = depIcao.trim().toUpperCase();
  const arr = arrIcao.trim().toUpperCase();

  const pdfUrl = getBriefPdfUrl(dep, arr, crossLimit);
  const fileName = `flight-risk-${dep}-${arr}.pdf`;

  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

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
      'PDF brifing oluşturulurken veya indirilirken bir hata oluştu.'
    );
  }
}