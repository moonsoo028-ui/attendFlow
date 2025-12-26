from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI()

# 정적 파일 디렉토리 마운트
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")

# 루트 경로
@app.get("/")
async def read_root():
    return FileResponse("index.html")

# 학생 페이지
@app.get("/student.html")
async def read_student():
    return FileResponse("student.html")

# 교사 페이지
@app.get("/teacher.html")
async def read_teacher():
    return FileResponse("teacher.html")

# 헬스체크 (Cloudtype용)
@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
