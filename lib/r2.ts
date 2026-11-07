import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2는 S3와 같은 방식으로 쓸 수 있어요.
// 서버에서만 import 하세요 (비밀 키가 들어 있어요).
let client: S3Client | null = null;

function r2() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

// 브라우저가 R2에 파일을 바로 올릴 수 있는 10분짜리 업로드 주소를 만들어요.
// 50MB 파일을 우리 서버를 거쳐 올리면 Vercel 요청 크기 제한에 걸리기 때문이에요.
export async function createUploadUrl(key: string, contentType: string, contentLength: number) {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(r2(), command, { expiresIn: 600 });
}
