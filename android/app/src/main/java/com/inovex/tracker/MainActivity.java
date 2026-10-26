package com.inovex.tracker;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenRecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
