import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import { incidentService } from "@/services/incident.service";
import type {
  IncidentItem,
  IncidentDetail,
  PaginationMeta,
  IncidentFilterParams,
  CreateIncidentPayload,
  UpdateIncidentPayload,
  ChangeStatusPayload,
  AssignIncidentPayload,
  CandidateResponder,
} from "@/types/incident";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/auth";

interface IncidentState {
  items: IncidentItem[];
  selectedIncident: IncidentDetail | null;
  pagination: PaginationMeta;
  filters: IncidentFilterParams;
  responders: CandidateResponder[];
  isLoadingList: boolean;
  isLoadingDetail: boolean;
  isSubmitting: boolean;
  isTransitioning: boolean;
  isAssigning: boolean;
  error: string | null;
  successMessage: string | null;
}

const initialFilters: IncidentFilterParams = {
  page: 1,
  limit: 10,
  sortBy: "createdAt",
  sortOrder: "desc",
};

const initialState: IncidentState = {
  items: [],
  selectedIncident: null,
  pagination: {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  },
  filters: initialFilters,
  responders: [],
  isLoadingList: false,
  isLoadingDetail: false,
  isSubmitting: false,
  isTransitioning: false,
  isAssigning: false,
  error: null,
  successMessage: null,
};

export const fetchIncidents = createAsyncThunk<
  { data: IncidentItem[]; pagination: PaginationMeta },
  IncidentFilterParams | void,
  { rejectValue: string }
>("incidents/fetchIncidents", async (params, { getState, rejectWithValue }) => {
  try {
    const state = getState() as { incidents: IncidentState };
    const query = { ...state.incidents.filters, ...(params || {}) };
    const response = await incidentService.getIncidents(query);
    return { data: response.data, pagination: response.pagination };
  } catch (err) {
    const error = err as AxiosError<ApiErrorResponse>;
    return rejectWithValue(error.response?.data?.message || "Failed to load incidents");
  }
});

export const fetchIncidentById = createAsyncThunk<
  IncidentDetail,
  string,
  { rejectValue: string }
>("incidents/fetchIncidentById", async (id, { rejectWithValue }) => {
  try {
    return await incidentService.getIncidentById(id);
  } catch (err) {
    const error = err as AxiosError<ApiErrorResponse>;
    return rejectWithValue(
      error.response?.data?.message || "Failed to retrieve incident details"
    );
  }
});

export const reportIncident = createAsyncThunk<
  IncidentItem,
  CreateIncidentPayload,
  { rejectValue: string }
>("incidents/reportIncident", async (payload, { rejectWithValue }) => {
  try {
    return await incidentService.createIncident(payload);
  } catch (err) {
    const error = err as AxiosError<ApiErrorResponse>;
    return rejectWithValue(
      error.response?.data?.message || "Failed to submit incident report"
    );
  }
});

export const modifyIncident = createAsyncThunk<
  IncidentDetail,
  { id: string; payload: UpdateIncidentPayload },
  { rejectValue: string }
>("incidents/modifyIncident", async ({ id, payload }, { rejectWithValue }) => {
  try {
    return await incidentService.updateIncident(id, payload);
  } catch (err) {
    const error = err as AxiosError<ApiErrorResponse>;
    return rejectWithValue(
      error.response?.data?.message || "Failed to update incident details"
    );
  }
});

export const transitionStatus = createAsyncThunk<
  IncidentDetail,
  { id: string; payload: ChangeStatusPayload },
  { rejectValue: string }
>("incidents/transitionStatus", async ({ id, payload }, { rejectWithValue }) => {
  try {
    return await incidentService.changeStatus(id, payload);
  } catch (err) {
    const error = err as AxiosError<ApiErrorResponse>;
    return rejectWithValue(
      error.response?.data?.message || "Failed to transition incident status"
    );
  }
});

export const assignResponder = createAsyncThunk<
  IncidentDetail,
  { id: string; payload: AssignIncidentPayload },
  { rejectValue: string }
>("incidents/assignResponder", async ({ id, payload }, { rejectWithValue }) => {
  try {
    return await incidentService.assignIncident(id, payload);
  } catch (err) {
    const error = err as AxiosError<ApiErrorResponse>;
    return rejectWithValue(
      error.response?.data?.message || "Failed to assign responder to incident"
    );
  }
});

export const fetchResponders = createAsyncThunk<
  CandidateResponder[],
  void,
  { rejectValue: string }
>("incidents/fetchResponders", async (_, { rejectWithValue }) => {
  try {
    return await incidentService.getResponders();
  } catch (err) {
    const error = err as AxiosError<ApiErrorResponse>;
    return rejectWithValue(
      error.response?.data?.message || "Failed to retrieve candidate responders"
    );
  }
});

export const incidentSlice = createSlice({
  name: "incidents",
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<IncidentFilterParams>>) => {
      state.filters = {
        ...state.filters,
        ...action.payload,
        // Reset to page 1 whenever criteria changes (unless page itself is explicitly set)
        page: action.payload.page ?? 1,
      };
    },
    clearFilters: (state) => {
      state.filters = initialFilters;
    },
    clearSelectedIncident: (state) => {
      state.selectedIncident = null;
      state.error = null;
    },
    clearMessages: (state) => {
      state.error = null;
      state.successMessage = null;
    },
  },
  extraReducers: (builder) => {
    // fetchIncidents
    builder
      .addCase(fetchIncidents.pending, (state) => {
        state.isLoadingList = true;
        state.error = null;
      })
      .addCase(fetchIncidents.fulfilled, (state, action) => {
        state.isLoadingList = false;
        state.items = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchIncidents.rejected, (state, action) => {
        state.isLoadingList = false;
        state.error = action.payload || "Failed to fetch incidents";
      });

    // fetchIncidentById
    builder
      .addCase(fetchIncidentById.pending, (state) => {
        state.isLoadingDetail = true;
        state.error = null;
      })
      .addCase(fetchIncidentById.fulfilled, (state, action) => {
        state.isLoadingDetail = false;
        state.selectedIncident = action.payload;
      })
      .addCase(fetchIncidentById.rejected, (state, action) => {
        state.isLoadingDetail = false;
        state.error = action.payload || "Failed to fetch incident detail";
      });

    // reportIncident
    builder
      .addCase(reportIncident.pending, (state) => {
        state.isSubmitting = true;
        state.error = null;
      })
      .addCase(reportIncident.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.items = [action.payload, ...state.items];
        state.successMessage = "Incident reported successfully";
      })
      .addCase(reportIncident.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Failed to report incident";
      });

    // modifyIncident
    builder
      .addCase(modifyIncident.pending, (state) => {
        state.isSubmitting = true;
        state.error = null;
      })
      .addCase(modifyIncident.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.selectedIncident = action.payload;
        state.items = state.items.map((i) =>
          i.id === action.payload.id ? action.payload : i
        );
        state.successMessage = "Incident updated successfully";
      })
      .addCase(modifyIncident.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Failed to update incident";
      });

    // transitionStatus
    builder
      .addCase(transitionStatus.pending, (state) => {
        state.isTransitioning = true;
        state.error = null;
      })
      .addCase(transitionStatus.fulfilled, (state, action) => {
        state.isTransitioning = false;
        state.selectedIncident = action.payload;
        state.items = state.items.map((i) =>
          i.id === action.payload.id ? action.payload : i
        );
        state.successMessage = "Incident status updated successfully";
      })
      .addCase(transitionStatus.rejected, (state, action) => {
        state.isTransitioning = false;
        state.error = action.payload || "Failed to transition status";
      });

    // assignResponder
    builder
      .addCase(assignResponder.pending, (state) => {
        state.isAssigning = true;
        state.error = null;
      })
      .addCase(assignResponder.fulfilled, (state, action) => {
        state.isAssigning = false;
        state.selectedIncident = action.payload;
        state.items = state.items.map((i) =>
          i.id === action.payload.id ? action.payload : i
        );
        state.successMessage = "Incident assigned successfully";
      })
      .addCase(assignResponder.rejected, (state, action) => {
        state.isAssigning = false;
        state.error = action.payload || "Failed to assign responder";
      });

    // fetchResponders
    builder
      .addCase(fetchResponders.fulfilled, (state, action) => {
        state.responders = action.payload;
      });
  },
});

export const { setFilters, clearFilters, clearSelectedIncident, clearMessages } =
  incidentSlice.actions;

export default incidentSlice.reducer;
