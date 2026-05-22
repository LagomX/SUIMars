import axios from 'axios';

export const SERVER_IP = '192.168.0.147';
export const API_BASE_URL = `http://${SERVER_IP}:8080`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});
