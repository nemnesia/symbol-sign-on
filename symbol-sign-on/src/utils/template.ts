import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * HTMLテンプレートを読み込み、プレースホルダを置換する
 * @param templateName テンプレートファイル名
 * @param variables 置換する変数のオブジェクト
 * @returns 置換後のHTML文字列
 */
export function renderTemplate(templateName: string, variables: Record<string, string>): string {
  const templatePath = path.join(__dirname, '../templates', templateName);
  
  try {
    let html = fs.readFileSync(templatePath, 'utf-8');
    
    // プレースホルダを置換
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      html = html.replace(new RegExp(placeholder, 'g'), value);
    }
    
    return html;
  } catch (error) {
    throw new Error(`Failed to render template ${templateName}: ${(error as Error).message}`);
  }
}
