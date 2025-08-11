import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import logger from '../utils/logger.js'

// __dirname を ESモジュールで定義
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'))
})

router.post('/', (req, res) => {
  console.log('Request body:', req.body)
  logger.info(`POST request to login.html with data:`, req.body)

  const filePath = path.join(__dirname, '../public/login.html')

  // HTMLファイルを読み取り
  import('fs')
    .then((fs) => {
      fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) {
          logger.error(`Error reading file: ${err.message}`)
          return res.status(404).send('ファイルが見つかりません')
        }

        // POSTデータをJSONとしてHTMLに埋め込む
        const postDataScript = `
                <script>
                    window.postData = ${JSON.stringify(req.body)};
                    console.log('POST Data received:', window.postData);
                </script>
            `

        // HTMLの</head>タグの前にスクリプトを挿入
        const modifiedHtml = html.replace('</head>', `${postDataScript}</head>`)

        res.setHeader('Content-Type', 'text/html')
        res.send(modifiedHtml)
      })
    })
    .catch((error) => {
      logger.error(`Error importing fs: ${error.message}`)
      res.status(500).send('Internal server error')
    })
})

export default router
