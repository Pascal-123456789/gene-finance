FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for SSL
RUN apt-get update && apt-get install -y libssl-dev gcc

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download NLTK data so it doesn't fail on AWS
RUN python -m nltk.downloader punkt brown

COPY . .

# Run uvicorn on port 8080 (AWS App Runner default)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
