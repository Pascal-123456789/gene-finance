FROM python:3.11-slim

WORKDIR /app

# Copy only backend files
COPY . .

# Install dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Download NLTK data
RUN python3 -c "import nltk; nltk.download('punkt'); nltk.download('brown')"

# Expose port
EXPOSE 8080

# Start the application
CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
